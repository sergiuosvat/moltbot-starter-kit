import axios from 'axios';
import {EventEmitter} from 'events';
import {CONFIG} from './config';
import {loadAgentConfig} from './utils/agent_config';
import {Logger} from './utils/logger';

export interface PaymentEvent {
  id?: string;
  amount: string;
  token: string;
  status?: string;
  txHash?: string;
  meta?: {
    jobId?: string;
    payload?: string;
    txHash?: string;
    paymentId?: string;
    /** Counterparty agent nonce — used for MCP reputation gating when MCP is enabled. */
    agentNonce?: number | string;
    /** When set and MCP is enabled, job work is done via this MCP tool instead of JobProcessor. */
    mcpTool?: string;
    /** Arguments for meta.mcpTool (defaults to `{ payload }` when omitted). */
    mcpArgs?: Record<string, unknown>;
    /** Optional expected amount/token (bound in addition to facilitator response). */
    expectedAmount?: string;
    expectedToken?: string;
    /** Match against agent.config.json services[].service_id for price checks. */
    serviceId?: number | string;
    /** Opt out of ESCROW_AUTO_RELEASE for this job when set to false. */
    releaseEscrow?: boolean;
    [key: string]: unknown;
  };
}

type PaymentCallback = (payment: PaymentEvent) => Promise<void>;

function normalizeToken(token: string): string {
  return token.trim().toUpperCase();
}

function amountsEqual(a: string, b: string): boolean {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return a.trim() === b.trim();
  }
}

export class Facilitator {
  private emitter = new EventEmitter();
  private pollingTimer: NodeJS.Timeout | null = null;
  private facilitatorUrl: string;
  private logger = new Logger('Facilitator');
  private consecutiveFailures = 0;
  private readonly basePollMs = 5000;
  private readonly maxPollMs = 60000;

  constructor(url?: string) {
    this.facilitatorUrl = url || CONFIG.PROVIDERS.FACILITATOR_URL;
  }

  /**
   * Subscribe to payment events. Multiple subscribers are supported.
   */
  onPayment(callback: PaymentCallback) {
    this.emitter.on('payment', callback);
  }

  /**
   * Synchronously emit a payment event to subscribers — used by tests.
   */
  emit(payment: PaymentEvent): void {
    this.emitter.emit('payment', payment);
  }

  async start() {
    this.logger.info(`Listener attached to ${this.facilitatorUrl}`);
    this.scheduleNextPoll(this.basePollMs);
  }

  async stop() {
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.emitter.removeAllListeners('payment');
  }

  /**
   * Best-effort mark event/payment as read so the facilitator stops redelivering.
   * Retries up to 3 times with exponential backoff before giving up.
   */
  async acknowledge(payment: PaymentEvent): Promise<void> {
    const id =
      payment.id ||
      payment.txHash ||
      payment.meta?.txHash ||
      payment.meta?.paymentId;
    if (!id) {
      this.logger.warn('Cannot ACK payment: missing id/proof');
      return;
    }

    const paths = [
      `/events/${encodeURIComponent(String(id))}/ack`,
      `/payments/${encodeURIComponent(String(id))}/ack`,
    ];

    const maxAckAttempts = 3;
    for (let attempt = 1; attempt <= maxAckAttempts; attempt++) {
      for (const p of paths) {
        try {
          const res = await axios.post(
            `${this.facilitatorUrl}${p}`,
            {},
            {
              timeout: CONFIG.REQUEST_TIMEOUT,
              validateStatus: status => status < 500,
            },
          );
          if (res.status >= 200 && res.status < 300) {
            this.logger.info(`ACKed payment ${id} via ${p}`);
            return;
          }
          if (res.status === 404) continue;
          this.logger.warn(`ACK ${p} returned HTTP ${res.status}`);
        } catch (err) {
          this.logger.warn(
            `ACK ${p} failed (attempt ${attempt}/${maxAckAttempts}): ${(err as Error).message}`,
          );
        }
      }
      if (attempt < maxAckAttempts) {
        await new Promise(r => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    }
    this.logger.warn(
      `Failed to ACK payment ${id} after ${maxAckAttempts} attempts; facilitator may redeliver`,
    );
  }

  /**
   * Validates payment schema, confirms settlement, and binds economic terms.
   * Throws when the payment must not be worked.
   */
  async verifyPayment(payment: PaymentEvent): Promise<string> {
    const jobId = payment.meta?.jobId;
    if (!jobId || typeof jobId !== 'string') {
      throw new Error('Payment missing meta.jobId');
    }
    if (!payment.amount) {
      throw new Error('Payment missing amount');
    }
    if (!payment.token) {
      throw new Error('Payment missing token');
    }

    const proof =
      payment.txHash ||
      payment.meta?.txHash ||
      payment.meta?.paymentId ||
      payment.id;
    if (!proof) {
      throw new Error(
        'Payment missing proof (txHash, meta.txHash, meta.paymentId, or id)',
      );
    }

    try {
      const res = await axios.get(
        `${this.facilitatorUrl}/payments/${encodeURIComponent(String(proof))}`,
        {
          timeout: CONFIG.REQUEST_TIMEOUT,
          validateStatus: status => status < 500,
        },
      );

      if (res.status === 200) {
        const status = String(res.data?.status ?? '')
          .toLowerCase()
          .trim();
        if (!['settled', 'confirmed', 'success', 'ok'].includes(status)) {
          throw new Error(
            status
              ? `Payment not settled (status=${status})`
              : 'Payment verification missing settlement status',
          );
        }
        this.bindEconomicTerms(payment, res.data);
        await this.bindAgainstAgentOffer(payment);
        return jobId;
      }

      if (res.status === 404) {
        await this.acceptUnverified(jobId);
        await this.bindAgainstAgentOffer(payment);
        return jobId;
      }

      throw new Error(`Payment verification failed (HTTP ${res.status})`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        await this.acceptUnverified(jobId);
        await this.bindAgainstAgentOffer(payment);
        return jobId;
      }
      if ((error as Error).message.startsWith('Payment')) throw error;
      if ((error as Error).message.includes('mismatch')) throw error;
      throw new Error(
        `Payment verification request failed: ${(error as Error).message}`,
      );
    }
  }

  private bindEconomicTerms(
    payment: PaymentEvent,
    remote?: Record<string, unknown>,
  ): void {
    if (remote && typeof remote === 'object') {
      const remoteAmount = remote.amount ?? remote.value;
      const remoteToken = remote.token ?? remote.asset ?? remote.currency;

      if (remoteAmount !== undefined && remoteAmount !== null) {
        if (!amountsEqual(String(remoteAmount), payment.amount)) {
          throw new Error(
            `Payment amount mismatch: event=${payment.amount} facilitator=${remoteAmount}`,
          );
        }
      }
      if (remoteToken !== undefined && remoteToken !== null) {
        if (
          normalizeToken(String(remoteToken)) !== normalizeToken(payment.token)
        ) {
          throw new Error(
            `Payment token mismatch: event=${payment.token} facilitator=${remoteToken}`,
          );
        }
      }
    }

    if (payment.meta?.expectedAmount) {
      if (!amountsEqual(payment.amount, String(payment.meta.expectedAmount))) {
        throw new Error(
          `Payment amount mismatch: event=${payment.amount} expected=${payment.meta.expectedAmount}`,
        );
      }
    }
    if (payment.meta?.expectedToken) {
      if (
        normalizeToken(payment.token) !==
        normalizeToken(String(payment.meta.expectedToken))
      ) {
        throw new Error(
          `Payment token mismatch: event=${payment.token} expected=${payment.meta.expectedToken}`,
        );
      }
    }
  }

  private async bindAgainstAgentOffer(payment: PaymentEvent): Promise<void> {
    this.bindEconomicTerms(payment);

    const serviceId = payment.meta?.serviceId;
    if (serviceId === undefined || serviceId === null) return;

    const config = await loadAgentConfig();
    const service = config.services.find(
      s => String(s.service_id) === String(serviceId),
    );
    if (!service) {
      throw new Error(
        `Payment meta.serviceId=${serviceId} not found in agent.config.json`,
      );
    }
    if (!amountsEqual(payment.amount, String(service.price))) {
      throw new Error(
        `Payment amount mismatch: event=${payment.amount} service=${service.price}`,
      );
    }
    if (
      normalizeToken(payment.token) !== normalizeToken(String(service.token))
    ) {
      throw new Error(
        `Payment token mismatch: event=${payment.token} service=${service.token}`,
      );
    }
  }

  private async acceptUnverified(jobId: string): Promise<string> {
    if (CONFIG.ALLOW_UNVERIFIED_PAYMENTS) {
      this.logger.warn(
        `Accepting unverified payment for ${jobId} (ALLOW_UNVERIFIED_PAYMENTS=true)`,
      );
      return jobId;
    }
    throw new Error(
      'Cannot verify payment with facilitator; set ALLOW_UNVERIFIED_PAYMENTS=true for local dev',
    );
  }

  /**
   * Computes next poll delay with exponential backoff & jitter on failure.
   */
  private nextDelayMs(): number {
    if (this.consecutiveFailures === 0) return this.basePollMs;
    const backoff = Math.min(
      this.basePollMs * 2 ** this.consecutiveFailures,
      this.maxPollMs,
    );
    const jitter = Math.floor(Math.random() * 1000);
    return backoff + jitter;
  }

  private scheduleNextPoll(delayMs: number): void {
    this.pollingTimer = setTimeout(() => this.poll(), delayMs);
  }

  private async poll(): Promise<void> {
    try {
      const res = await axios.get(`${this.facilitatorUrl}/events?unread=true`, {
        timeout: CONFIG.REQUEST_TIMEOUT,
      });
      const events = res.data;
      if (Array.isArray(events)) {
        for (const payment of events) {
          this.emitter.emit('payment', payment);
        }
      }
      this.consecutiveFailures = 0;
    } catch (e) {
      this.consecutiveFailures++;
      const next = this.nextDelayMs();
      this.logger.warn(
        `Facilitator poll failed (${this.consecutiveFailures}): ${
          (e as Error).message
        }. Next attempt in ${next}ms.`,
      );
    } finally {
      this.scheduleNextPoll(this.nextDelayMs());
    }
  }

  async prepare(request: {
    agentNonce: number;
    serviceId: string;
    employerAddress: string;
    jobId?: string;
  }) {
    const res = await axios.post(`${this.facilitatorUrl}/prepare`, request);
    return res.data;
  }

  async settle(payload: {
    receiver: string;
    value: string;
    [key: string]: unknown;
  }) {
    const res = await axios.post(`${this.facilitatorUrl}/settle`, {
      scheme: 'exact',
      payload,
      requirements: {
        payTo: payload.receiver,
        amount: payload.value,
        asset: 'EGLD',
        network: CONFIG.CHAIN_ID,
      },
    });
    return res.data;
  }
}
