/**
 * Identity Skills — register, update, query agent identity on the Identity Registry
 */
import {Address} from '@multiversx/sdk-core';

import {CONFIG} from '../config';
import {Logger} from '../utils/logger';
import {
  encodeMetadataVariadic,
  encodeServiceConfigsVariadic,
  type ServiceConfigInput,
} from '../utils/identity_encoding';
import {
  loadSignerWithAddress,
  createProvider,
  createEntrypoint,
  createPatchedAbi,
  discoverRelayerAddress,
  signAndSend,
  signAndRelay,
  solveRelayerChallenge,
  withRelayer,
} from '../chain';
import * as identityAbiJson from '../abis/identity-registry.abi.json';

const logger = new Logger('IdentitySkills');

export interface AgentDetails {
  name: string;
  uri: string;
  public_key: string;
  owner: Address;
  metadata: Array<{key: string; value: string}>;
}

export interface RegisterAgentParams {
  name: string;
  uri: string;
  metadata?: Array<{key: string; value: string}>;
  services?: ServiceConfigInput[];
  useRelayer?: boolean;
  /** Explicit relayer (preferred when caller already discovered it). */
  relayerUrl?: string;
  relayerAddress?: string;
}

export interface SetMetadataParams {
  agentNonce: number;
  entries: Array<{key: string; value: string}>;
}

export interface SetServiceConfigsParams {
  agentNonce: number;
  services: ServiceConfigInput[];
}

export async function registerAgent(
  params: RegisterAgentParams,
): Promise<string> {
  logger.info(`Registering agent: ${params.name}`);

  const {signer, senderAddress} = await loadSignerWithAddress();
  const provider = createProvider('moltbot-skills');

  const entrypoint = createEntrypoint();
  const abi = createPatchedAbi(identityAbiJson);
  const factory = entrypoint.createSmartContractTransactionsFactory(abi);

  const registry = Address.newFromBech32(CONFIG.ADDRESSES.IDENTITY_REGISTRY);

  const tx = await factory.createTransactionForExecute(senderAddress, {
    contract: registry,
    function: 'register_agent',
    gasLimit: CONFIG.GAS_LIMITS.REGISTER,
    arguments: [
      Buffer.from(params.name),
      Buffer.from(params.uri),
      Buffer.from(senderAddress.getPublicKey()),
      encodeMetadataVariadic(params.metadata ?? []),
      encodeServiceConfigsVariadic(params.services ?? []),
    ],
  });

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
    const challengeNonce = await solveRelayerChallenge(
      relayerUrl,
      senderAddress.toBech32(),
    );
    txHash = await signAndRelay(
      tx,
      signer,
      senderAddress,
      provider,
      relayerUrl,
      {challengeNonce},
    );
  } else if (params.useRelayer) {
    throw new Error(
      'useRelayer=true but relayer URL/address unavailable; set MULTIVERSX_RELAYER_URL or pass relayerUrl/relayerAddress',
    );
  } else {
    txHash = await signAndSend(tx, signer, senderAddress, provider);
  }

  logger.info(`Registration tx: ${txHash}`);
  return txHash;
}

export async function getAgent(
  agentNonce: number,
): Promise<AgentDetails | null> {
  const entrypoint = createEntrypoint();
  const abi = createPatchedAbi(identityAbiJson);
  const controller = entrypoint.createSmartContractController(abi);
  const registry = Address.newFromBech32(CONFIG.ADDRESSES.IDENTITY_REGISTRY);

  try {
    const results = await controller.query({
      contract: registry,
      function: 'get_agent',
      arguments: [agentNonce],
    });

    if (!results[0]) return null;
    return results[0] as AgentDetails;
  } catch (error) {
    logger.warn(
      `Failed to get agent ${agentNonce}: ${(error as Error).message}`,
    );
    return null;
  }
}

export async function setMetadata(params: SetMetadataParams): Promise<string> {
  logger.info(
    `Setting ${params.entries.length} metadata entries for agent #${params.agentNonce}`,
  );

  const {signer, senderAddress} = await loadSignerWithAddress();
  const provider = createProvider('moltbot-skills');

  const entrypoint = createEntrypoint();
  const abi = createPatchedAbi(identityAbiJson);
  const factory = entrypoint.createSmartContractTransactionsFactory(abi);
  const registry = Address.newFromBech32(CONFIG.ADDRESSES.IDENTITY_REGISTRY);

  const tx = await factory.createTransactionForExecute(senderAddress, {
    contract: registry,
    function: 'set_metadata',
    gasLimit: CONFIG.GAS_LIMITS.UPDATE,
    arguments: [
      BigInt(params.agentNonce),
      encodeMetadataVariadic(params.entries),
    ],
  });

  const txHash = await signAndSend(tx, signer, senderAddress, provider);
  logger.info(`Metadata tx: ${txHash}`);
  return txHash;
}

export async function setServiceConfigs(
  params: SetServiceConfigsParams,
): Promise<string> {
  logger.info(
    `Setting ${params.services.length} service configs for agent #${params.agentNonce}`,
  );

  const {signer, senderAddress} = await loadSignerWithAddress();
  const provider = createProvider('moltbot-skills');

  const entrypoint = createEntrypoint();
  const abi = createPatchedAbi(identityAbiJson);
  const factory = entrypoint.createSmartContractTransactionsFactory(abi);
  const registry = Address.newFromBech32(CONFIG.ADDRESSES.IDENTITY_REGISTRY);

  const tx = await factory.createTransactionForExecute(senderAddress, {
    contract: registry,
    function: 'set_service_configs',
    gasLimit: CONFIG.GAS_LIMITS.UPDATE,
    arguments: [
      BigInt(params.agentNonce),
      encodeServiceConfigsVariadic(params.services),
    ],
  });

  const txHash = await signAndSend(tx, signer, senderAddress, provider);
  logger.info(`Service configs tx: ${txHash}`);
  return txHash;
}
