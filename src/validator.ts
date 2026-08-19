import {Address} from '@multiversx/sdk-core';
import axios from 'axios';
import {CONFIG} from './config';
import {loadAgentConfig} from './utils/agent_config';
import {resolveAgentUri} from './utils/agent_uri';
import {
  encodeMetadataVariadic,
  encodeServiceConfigsVariadic,
} from './utils/identity_encoding';
import {requireTxSuccess} from './utils/wait_for_tx';
import * as identityAbiJson from './abis/identity-registry.abi.json';
import {Logger} from './utils/logger';
import {PoWSolver} from './pow';
import {
  loadSignerWithAddress,
  createProvider,
  createEntrypoint,
  createPatchedAbi,
  withRelayer,
} from './chain';
import {submitProof as submitProofSkill} from './skills/validation_skills';

/**
 * Runtime proof submission with auto-registration + relayer support.
 * Builds on validation_skills.submitProof so scripts and daemon share one path.
 */
export class Validator {
  private logger = new Logger('Validator');
  private relayerUrl: string | null = null;
  private relayerAddress: string | null = null;

  setRelayerConfig(url: string, address: string) {
    this.relayerUrl = url;
    this.relayerAddress = address;
  }

  async submitProof(
    jobId: string,
    resultHash: string,
    options?: {gasPrice?: string},
  ): Promise<string> {
    this.logger.info(`Submitting proof for ${jobId}:hash=${resultHash}`);

    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        const txHash = await submitProofSkill({
          jobId,
          proofHash: resultHash,
          relayerUrl: this.relayerUrl || undefined,
          relayerAddress: this.relayerAddress || undefined,
          gasPrice: options?.gasPrice,
        });
        this.logger.info(`Transaction sent: ${txHash}`);
        return txHash;
      } catch (e: unknown) {
        const err = e as {
          response?: {
            data?: {error?: string; code?: string};
            status?: number;
          };
          message?: string;
        };
        const msg = err.response?.data?.error || err.message;
        const status = err.response?.status;
        const errorCode = err.response?.data?.code;

        const isUnregistered =
          errorCode === 'AGENT_NOT_REGISTERED' ||
          (errorCode === undefined &&
            status === 403 &&
            /agent.+not.+register|not.+register.+agent/i.test(msg ?? ''));

        if (isUnregistered) {
          this.logger.warn(
            'Agent not registered. Initiating Auto-Registration...',
          );
          try {
            await this.registerAgent();
            this.logger.info(
              'Registration successful. Retrying proof submission...',
            );
            attempts--;
            continue;
          } catch (regError) {
            this.logger.error(
              'Auto-Registration failed:',
              (regError as Error).message,
            );
            throw regError;
          }
        }

        attempts++;
        this.logger.warn(`Tx Broadcast Attempt ${attempts} failed: ${msg}`);
        if (attempts >= maxAttempts) throw e;
        await new Promise(r => setTimeout(r, 1000 * attempts));
      }
    }
    throw new Error('Failed to broadcast transaction after retries');
  }

  async registerAgent() {
    if (!this.relayerUrl || !this.relayerAddress) {
      throw new Error('Relayer not configured. Cannot register.');
    }

    this.logger.info('Fetching PoW Challenge...');
    const {senderAddress} = await loadSignerWithAddress();

    const challengeRes = await axios.post(`${this.relayerUrl}/challenge`, {
      address: senderAddress.toBech32(),
    });
    const challenge = challengeRes.data;

    const nonce = new PoWSolver().solve(challenge);

    const provider = createProvider('moltbot');
    const account = await provider.getAccount({
      bech32: () => senderAddress.toBech32(),
    });

    const entrypoint = createEntrypoint();
    const identityAbi = createPatchedAbi(identityAbiJson);
    const factory =
      entrypoint.createSmartContractTransactionsFactory(identityAbi);

    const agentConfig = await loadAgentConfig();
    const agentUri = resolveAgentUri(agentConfig);

    const tx = await factory.createTransactionForExecute(senderAddress, {
      contract: new Address(CONFIG.ADDRESSES.IDENTITY_REGISTRY),
      function: 'register_agent',
      gasLimit: CONFIG.GAS_LIMITS.REGISTER_AGENT,
      arguments: [
        Buffer.from(agentConfig.agentName || CONFIG.AGENT.NAME),
        Buffer.from(agentUri),
        Buffer.from(senderAddress.getPublicKey()),
        encodeMetadataVariadic(agentConfig.metadata),
        encodeServiceConfigsVariadic(agentConfig.services),
      ],
    });

    tx.nonce = BigInt(account.nonce);
    withRelayer(tx, new Address(this.relayerAddress));

    this.logger.info('Relaying Registration Transaction...');
    const relayRes = await axios.post(`${this.relayerUrl}/relay`, {
      transaction: tx.toPlainObject(),
      challengeNonce: nonce,
    });

    this.logger.info(`Registration Tx Sent: ${relayRes.data.txHash}`);
    this.logger.info('Waiting for registration to be confirmed...');
    await requireTxSuccess(relayRes.data.txHash);
  }

  async getTxStatus(txHash: string): Promise<string> {
    const provider = createProvider('moltbot');
    try {
      const tx = await this.withTimeout(
        provider.getTransaction(txHash),
        'Fetching Transaction Status',
      );
      return tx.status.toString().toLowerCase();
    } catch (e: unknown) {
      const err = e as {response?: {status?: number}; message?: string};
      if (err.response?.status === 404 || err.message?.includes('404')) {
        return 'not_found';
      }
      this.logger.warn(
        `Failed to fetch status for ${txHash}: ${(e as Error).message}`,
      );
      return 'unknown';
    }
  }

  private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`${label} timed out after ${CONFIG.REQUEST_TIMEOUT}ms`),
          ),
        CONFIG.REQUEST_TIMEOUT,
      );
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timer!);
      return result;
    } catch (error) {
      clearTimeout(timer!);
      throw error;
    }
  }
}
