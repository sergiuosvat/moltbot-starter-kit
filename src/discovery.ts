import axios from 'axios';

import {CONFIG} from './config';
import {loadSignerWithAddress} from './chain';
import {Logger} from './utils/logger';
import {assertAllowedAgentUrl} from './utils/url_guard';
import {MoltbotMppSkill, type AgentSpendingPolicy} from './skills/mpp_skills';

export interface PaymentInfo {
  intent: 'charge' | 'session';
  method: string;
  amount: string | null;
  currency: string;
  description?: string;
  recipient?: string;
}

export interface NegotiateSessionOptions {
  recipientAddress?: string;
  durationSeconds?: number;
  spendingPolicy?: AgentSpendingPolicy;
}

function normalizePaymentInfo(raw: unknown): PaymentInfo | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Record<string, unknown>;
  const intent = record.intent;
  if (intent !== 'charge' && intent !== 'session') return null;
  if (typeof record.currency !== 'string') return null;

  const recipient =
    typeof record.recipient === 'string'
      ? record.recipient
      : typeof record.address === 'string'
        ? record.address
        : undefined;

  return {
    intent,
    method: typeof record.method === 'string' ? record.method : 'transfer',
    amount:
      record.amount !== null && record.amount !== undefined
        ? String(record.amount)
        : null,
    currency: record.currency,
    description:
      typeof record.description === 'string' ? record.description : undefined,
    recipient,
  };
}

function buildMppChallengeUrl(
  recipient: string,
  amount: bigint,
  currency: string,
  durationSeconds: number,
): string {
  return `mpp://pay?recipient=${recipient}&amount=${amount}&currency=${currency}&method=transfer&duration=${durationSeconds}`;
}

function defaultSpendingPolicy(currency: string): AgentSpendingPolicy {
  return {
    maxPerTransactionNative: 10n ** 21n,
    whitelistedCurrencies: [currency, 'EGLD'],
  };
}

export class AgentDiscovery {
  private logger = new Logger('AgentDiscovery');

  async getPaymentInfo(
    agentUrl: string,
    endpointPath?: string,
  ): Promise<PaymentInfo | null> {
    try {
      assertAllowedAgentUrl(agentUrl);
      this.logger.info(
        `Fetching discovery document from ${agentUrl}/openapi.json...`,
      );
      const res = await axios.get(`${agentUrl}/openapi.json`, {
        timeout: CONFIG.REQUEST_TIMEOUT,
      });
      const openapi = res.data;

      this.logger.info(`Discovered Service: ${openapi.info?.title}`);

      let paymentInfo: PaymentInfo | null = null;
      if (endpointPath && openapi.paths && openapi.paths[endpointPath]) {
        const methods = Object.keys(openapi.paths[endpointPath]);
        if (methods.length > 0) {
          const method = methods[0];
          paymentInfo = normalizePaymentInfo(
            openapi.paths[endpointPath][method]['x-payment-info'],
          );
        }
      }

      if (
        !paymentInfo &&
        openapi['x-service-info'] &&
        openapi['x-service-info'].defaultPayment
      ) {
        paymentInfo = normalizePaymentInfo(
          openapi['x-service-info'].defaultPayment,
        );
      }

      if (paymentInfo) {
        this.logger.info(
          `Payment required: ${paymentInfo.amount} ${paymentInfo.currency} (${paymentInfo.intent})`,
        );
      } else {
        this.logger.info(
          `No payment info found for ${endpointPath || 'service'}`,
        );
      }

      return paymentInfo;
    } catch (e) {
      this.logger.warn(
        `Failed to discover agent payment info: ${(e as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Pays for a session/charge using the agent's OpenAPI payment metadata.
   * Returns the on-chain transaction hash as payment proof, or null on failure.
   */
  async negotiateSession(
    agentUrl: string,
    paymentInfo: PaymentInfo,
    options: NegotiateSessionOptions = {},
  ): Promise<string | null> {
    try {
      assertAllowedAgentUrl(agentUrl);
    } catch (error) {
      this.logger.warn(
        `Agent URL not allowed for negotiation: ${(error as Error).message}`,
      );
      return null;
    }

    this.logger.info(
      `Negotiating ${paymentInfo.intent} with ${agentUrl} for ${paymentInfo.amount} ${paymentInfo.currency}...`,
    );

    if (!paymentInfo.amount) {
      this.logger.warn('Cannot negotiate payment without amount');
      return null;
    }

    const recipient = paymentInfo.recipient ?? options.recipientAddress;
    if (!recipient) {
      this.logger.warn('Cannot negotiate payment without recipient address');
      return null;
    }

    const currency = paymentInfo.currency || 'EGLD';
    const durationSeconds = options.durationSeconds ?? 3600;
    const policy = options.spendingPolicy ?? defaultSpendingPolicy(currency);

    try {
      const amount = BigInt(paymentInfo.amount);
      const challengeUrl = buildMppChallengeUrl(
        recipient,
        amount,
        currency,
        durationSeconds,
      );

      const {signer} = await loadSignerWithAddress();
      const mppSkill = new MoltbotMppSkill(signer, policy, CONFIG.API_URL);

      const txHash = await mppSkill.attemptPayment(challengeUrl);
      this.logger.info(`Session negotiated. Proof: ${txHash}`);
      return txHash;
    } catch (error) {
      this.logger.error(
        `Session negotiation failed: ${(error as Error).message}`,
        error,
      );
      return null;
    }
  }
}
