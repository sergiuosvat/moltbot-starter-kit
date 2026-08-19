/**
 * Validation Skills — job lifecycle on the Validation Registry
 *
 * Uses the centralized chain/ layer.
 */
import {Address} from '@multiversx/sdk-core';

import {CONFIG} from '../config';
import {Logger} from '../utils/logger';
import {
  loadSignerWithAddress,
  createProvider,
  createEntrypoint,
  createPatchedAbi,
  discoverRelayerAddress,
  signAndSend,
  signAndRelay,
  withRelayer,
} from '../chain';
import * as validationAbiJson from '../abis/validation-registry.abi.json';

const logger = new Logger('ValidationSkills');

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface InitJobParams {
  jobId: string;
  agentNonce: number;
  serviceId?: number;
  paymentAmount?: bigint;
  paymentToken?: string;
}

export interface SubmitProofParams {
  jobId: string;
  proofHash: string;
  useRelayer?: boolean;
  /** Explicit relayer (preferred when caller already discovered it). */
  relayerUrl?: string;
  relayerAddress?: string;
  gasPrice?: string;
}

export interface JobData {
  status: string;
  proof: Uint8Array;
  employer: Address;
  creation_timestamp: bigint;
  agent_nonce: bigint;
}

// ─── init_job ──────────────────────────────────────────────────────────────────

export async function initJob(params: InitJobParams): Promise<string> {
  logger.info(
    `Initializing job: ${params.jobId} for agent #${params.agentNonce}`,
  );

  const {signer, senderAddress} = await loadSignerWithAddress();
  const provider = createProvider('moltbot-skills');

  const entrypoint = createEntrypoint();
  const abi = createPatchedAbi(validationAbiJson);
  const factory = entrypoint.createSmartContractTransactionsFactory(abi);

  const registry = Address.newFromBech32(CONFIG.ADDRESSES.VALIDATION_REGISTRY);

  const args: unknown[] = [
    Buffer.from(params.jobId),
    BigInt(params.agentNonce),
  ];

  if (params.serviceId !== undefined) {
    args.push(params.serviceId);
  }

  const tx = await factory.createTransactionForExecute(senderAddress, {
    contract: registry,
    function: 'init_job',
    gasLimit: CONFIG.GAS_LIMITS.SUBMIT_PROOF,
    arguments: args,
    nativeTransferAmount: params.paymentAmount ?? 0n,
  });

  const txHash = await signAndSend(tx, signer, senderAddress, provider);
  logger.info(`init_job tx: ${txHash}`);
  return txHash;
}

// ─── submit_proof ──────────────────────────────────────────────────────────────

export async function submitProof(params: SubmitProofParams): Promise<string> {
  logger.info(`Submitting proof for ${params.jobId}: hash=${params.proofHash}`);

  const {signer, senderAddress} = await loadSignerWithAddress();
  const provider = createProvider('moltbot-skills');

  const entrypoint = createEntrypoint();
  const abi = createPatchedAbi(validationAbiJson);
  const factory = entrypoint.createSmartContractTransactionsFactory(abi);

  const registry = Address.newFromBech32(CONFIG.ADDRESSES.VALIDATION_REGISTRY);

  const tx = await factory.createTransactionForExecute(senderAddress, {
    contract: registry,
    function: 'submit_proof',
    gasLimit: CONFIG.GAS_LIMITS.SUBMIT_PROOF,
    arguments: [
      Buffer.from(params.jobId),
      Buffer.from(params.proofHash, 'hex'),
    ],
  });

  if (params.gasPrice) {
    tx.gasPrice = BigInt(params.gasPrice);
  }

  const relayerUrl =
    params.relayerUrl ||
    (params.useRelayer ? CONFIG.PROVIDERS.RELAYER_URL : undefined);
  let relayerAddress = params.relayerAddress;

  if (!relayerAddress && params.useRelayer) {
    relayerAddress = (await discoverRelayerAddress(senderAddress)) || undefined;
  }

  if (relayerAddress) {
    withRelayer(tx, Address.newFromBech32(relayerAddress));
  }

  let txHash: string;
  if (relayerUrl && relayerAddress) {
    txHash = await signAndRelay(
      tx,
      signer,
      senderAddress,
      provider,
      relayerUrl,
    );
  } else if (params.useRelayer) {
    throw new Error(
      'useRelayer=true but relayer URL/address unavailable; set MULTIVERSX_RELAYER_URL or pass relayerUrl/relayerAddress',
    );
  } else {
    txHash = await signAndSend(tx, signer, senderAddress, provider);
  }

  logger.info(`submit_proof tx: ${txHash}`);
  return txHash;
}

// ─── is_job_verified ───────────────────────────────────────────────────────────

export async function isJobVerified(jobId: string): Promise<boolean> {
  const entrypoint = createEntrypoint();
  const abi = createPatchedAbi(validationAbiJson);
  const controller = entrypoint.createSmartContractController(abi);
  const registry = Address.newFromBech32(CONFIG.ADDRESSES.VALIDATION_REGISTRY);

  try {
    const results = await controller.query({
      contract: registry,
      function: 'is_job_verified',
      arguments: [Buffer.from(jobId)],
    });
    return results[0] === true;
  } catch {
    return false;
  }
}

// ─── get_job_data ──────────────────────────────────────────────────────────────

export async function getJobData(jobId: string): Promise<JobData | null> {
  const entrypoint = createEntrypoint();
  const abi = createPatchedAbi(validationAbiJson);
  const controller = entrypoint.createSmartContractController(abi);
  const registry = Address.newFromBech32(CONFIG.ADDRESSES.VALIDATION_REGISTRY);

  try {
    const results = await controller.query({
      contract: registry,
      function: 'get_job_data',
      arguments: [Buffer.from(jobId)],
    });
    if (!results[0]) return null;
    return results[0] as JobData;
  } catch {
    logger.warn(`Failed to get job data for ${jobId}`);
    return null;
  }
}
