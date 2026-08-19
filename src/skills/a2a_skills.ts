import {Address} from '@multiversx/sdk-core';
import {UserSigner} from '@multiversx/sdk-wallet';

import {CONFIG} from '../config';
import {
  createEntrypoint,
  createPatchedAbi,
  loadSignerWithAddress,
} from '../chain';
import {AgentDiscovery} from '../discovery';
import {Logger} from '../utils/logger';
import {assertAllowedAgentUrl} from '../utils/url_guard';
import * as identityAbiJson from '../abis/identity-registry.abi.json';
import {getAgent} from './identity_skills';
import {fundSessionFromDiscovery} from './mpp_automation';
import {MoltbotMppSkill, type AgentSpendingPolicy} from './mpp_skills';

const logger = new Logger('A2ASkills');

export interface A2ANegotiationResult {
  agentUri: string;
  channelId: string | null;
  success: boolean;
}

export interface AgentOwnerMatch {
  nonce: number;
  uri: string;
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function resolveWalletAddress(signer: UserSigner): string {
  return signer.getAddress().bech32();
}

/**
 * Finds an on-chain agent nonce and URI by owner wallet address.
 * Uses get_agent_id (variadic nonce↔address pairs) instead of O(n) owner scans.
 */
export async function findAgentByOwner(
  ownerAddress: string,
): Promise<AgentOwnerMatch | null> {
  let target: Address;
  try {
    target = Address.newFromBech32(ownerAddress);
  } catch {
    logger.warn(`Invalid agent owner address: ${ownerAddress}`);
    return null;
  }

  const entrypoint = createEntrypoint();
  const abi = createPatchedAbi(identityAbiJson);
  const controller = entrypoint.createSmartContractController(abi);
  const registry = Address.newFromBech32(CONFIG.ADDRESSES.IDENTITY_REGISTRY);
  const targetBech = target.toBech32();

  try {
    const results = await controller.query({
      contract: registry,
      function: 'get_agent_id',
      arguments: [],
    });

    // SDK may return [[nonce, address], ...] or a flat [nonce, address, ...] list.
    const pairs = normalizeAgentIdPairs(results);
    for (const [nonce, owner] of pairs) {
      const ownerBech =
        typeof owner === 'string'
          ? owner
          : ((owner as Address).toBech32?.() ?? String(owner));
      if (ownerBech !== targetBech) continue;

      const agent = await getAgent(nonce);
      return {nonce, uri: agent?.uri ?? ''};
    }
  } catch (error) {
    logger.warn(
      `Failed to resolve agent by owner ${ownerAddress}: ${(error as Error).message}`,
    );
  }

  return null;
}

function normalizeAgentIdPairs(
  results: unknown[],
): Array<[number, Address | string]> {
  const pairs: Array<[number, Address | string]> = [];
  if (!results || results.length === 0) return pairs;

  // Nested tuples: [[nonce, address], ...]
  if (Array.isArray(results[0])) {
    for (const item of results) {
      if (!Array.isArray(item) || item.length < 2) continue;
      pairs.push([Number(item[0]), item[1] as Address | string]);
    }
    return pairs;
  }

  // Flat alternating: [nonce, address, nonce, address, ...]
  for (let i = 0; i + 1 < results.length; i += 2) {
    pairs.push([Number(results[i]), results[i + 1] as Address | string]);
  }
  return pairs;
}

/**
 * Reads service pricing from the Identity Registry for an agent owner address.
 */
export async function getAgentPricing(
  agentAddress: string,
  serviceId: number = 1,
): Promise<bigint> {
  const match = await findAgentByOwner(agentAddress);
  if (!match) {
    throw new Error(`Agent not found for address ${agentAddress}`);
  }

  const entrypoint = createEntrypoint();
  const abi = createPatchedAbi(identityAbiJson);
  const controller = entrypoint.createSmartContractController(abi);
  const registry = Address.newFromBech32(CONFIG.ADDRESSES.IDENTITY_REGISTRY);

  const results = await controller.query({
    contract: registry,
    function: 'get_agent_service_config',
    arguments: [match.nonce, serviceId],
  });

  const payment = results[0] as {amount?: bigint | string} | null | undefined;
  if (!payment) {
    throw new Error(`No service config ${serviceId} for agent ${agentAddress}`);
  }

  return BigInt(payment.amount ?? 0);
}

/**
 * Pings another agent via their registered URI found in mx8004 to verify availability.
 */
export async function pingAgent(agentNonce: number): Promise<boolean> {
  const agent = await getAgent(agentNonce);
  if (!agent) {
    logger.error(`Agent ${agentNonce} not found in registry.`);
    return false;
  }

  return pingAgentUri(agent.uri);
}

/**
 * Pings an agent HTTP endpoint (`/ping`, then `/health`).
 */
export async function pingAgentUri(agentUri: string): Promise<boolean> {
  try {
    assertAllowedAgentUrl(agentUri);
  } catch {
    return false;
  }

  const base = agentUri.replace(/\/$/, '');
  if (await isReachable(`${base}/ping`)) return true;
  return isReachable(`${base}/health`);
}

/**
 * Authenticates with an external agent using ED25519 nonce challenge-response.
 * Matches mx-agent-orchestrator A2A flow: /auth/nonce → sign → /auth/verify.
 */
export async function authenticateA2A(
  agentUrl: string,
  signer?: UserSigner,
): Promise<string> {
  assertAllowedAgentUrl(agentUrl);
  const activeSigner = signer ?? (await loadSignerWithAddress()).signer;
  const walletAddress = resolveWalletAddress(activeSigner);
  const base = agentUrl.replace(/\/$/, '');

  const nonceRes = await fetch(`${base}/auth/nonce`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({walletAddress}),
    signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT),
  });

  if (!nonceRes.ok) {
    throw new Error(
      `Failed to get nonce from ${agentUrl}: ${await nonceRes.text()}`,
    );
  }

  const {nonce} = (await nonceRes.json()) as {nonce: string};
  const signature = await activeSigner.sign(Buffer.from(nonce));

  const verifyRes = await fetch(`${base}/auth/verify`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      walletAddress,
      nonce,
      signature: signature.toString('hex'),
    }),
    signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT),
  });

  if (!verifyRes.ok) {
    throw new Error(
      `A2A verification failed at ${agentUrl}: ${await verifyRes.text()}`,
    );
  }

  const {token} = (await verifyRes.json()) as {token: string};
  return token;
}

/**
 * Makes an authenticated HTTP request to an agent endpoint.
 */
export async function authenticatedA2ARequest(
  agentUrl: string,
  endpoint: string,
  options: RequestInit = {},
  signer?: UserSigner,
): Promise<Response> {
  const token = await authenticateA2A(agentUrl, signer);
  const base = agentUrl.replace(/\/$/, '');
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  const headers = new Headers(options.headers ?? {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(`${base}${path}`, {
    ...options,
    headers,
    signal: options.signal ?? AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT),
  });
}

function createDefaultMppPolicy(tokenIdentifier: string): AgentSpendingPolicy {
  return {
    maxPerTransactionNative: 10n ** 21n,
    whitelistedCurrencies: [tokenIdentifier, 'EGLD'],
  };
}

function buildMppChallengeUrl(
  agentAddress: string,
  price: bigint,
  tokenIdentifier: string,
  durationSeconds: number,
): string {
  return `mpp://pay?recipient=${agentAddress}&amount=${price}&currency=${tokenIdentifier}&method=transfer&duration=${durationSeconds}`;
}

/**
 * Discover an agent, verify reachability, and open a funded A2A session.
 * Distinct from hireWithEscrow (on-chain escrow) and the facilitator employer demo.
 */
export async function openA2ASession(
  agentAddress: string,
  tokenIdentifier: string,
  durationSeconds: number,
  serviceId: number = 1,
): Promise<A2ANegotiationResult> {
  logger.info(`Starting A2A session negotiation for agent: ${agentAddress}`);

  const match = await findAgentByOwner(agentAddress);
  const agentUri = match?.uri ?? '';

  if (agentUri) {
    const reachable = await pingAgentUri(agentUri);
    if (!reachable) {
      logger.warn(`Agent URI unreachable: ${agentUri}`);
    }
  }

  const discovery = new AgentDiscovery();
  if (agentUri) {
    const paymentInfo = await discovery.getPaymentInfo(agentUri, '/mcp/tools');
    if (paymentInfo?.intent === 'session' && paymentInfo.amount) {
      const proof = await discovery.negotiateSession(agentUri, paymentInfo, {
        recipientAddress: agentAddress,
        durationSeconds,
      });
      if (proof) {
        logger.info(`Opened A2A session via OpenAPI negotiation: ${proof}`);
        return {agentUri, channelId: proof, success: true};
      }
    }
  }

  const {signer} = await loadSignerWithAddress();
  const mppSkill = new MoltbotMppSkill(
    signer,
    createDefaultMppPolicy(tokenIdentifier),
    CONFIG.API_URL,
  );

  const identitySkill = {
    getAgentPricing: (address: string) => getAgentPricing(address, serviceId),
  };

  const mppSessionSkill = {
    openSession: async (
      address: string,
      price: bigint,
      token: string,
      duration: number,
    ) => {
      const challengeUrl = buildMppChallengeUrl(
        address,
        price,
        token,
        duration,
      );
      return mppSkill.attemptPayment(challengeUrl);
    },
    requestCloseSession: async (channelId: string) => {
      if (!agentUri) return channelId;

      try {
        const response = await authenticatedA2ARequest(
          agentUri,
          '/session/close',
          {
            method: 'POST',
            body: JSON.stringify({channelId}),
          },
          signer,
        );
        if (response.ok) {
          const body = (await response.json()) as {txHash?: string};
          return body.txHash ?? channelId;
        }
      } catch {
        logger.warn(
          `Agent ${agentUri} does not support session close endpoint`,
        );
      }

      return channelId;
    },
  };

  try {
    const channelId = await fundSessionFromDiscovery(
      identitySkill,
      mppSessionSkill,
      agentAddress,
      tokenIdentifier,
      durationSeconds,
    );

    if (!channelId) {
      logger.error(
        `Failed to negotiate and fund A2A session for ${agentAddress}`,
      );
      return {agentUri, channelId: null, success: false};
    }

    logger.info(
      `Successfully opened A2A session with channel ID: ${channelId}`,
    );
    return {agentUri, channelId, success: true};
  } catch (error) {
    logger.error(
      `A2A session failed for ${agentAddress}: ${(error as Error).message}`,
      error,
    );
    return {agentUri, channelId: null, success: false};
  }
}
