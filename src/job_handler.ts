import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';

import {Validator} from './validator';
import {JobProcessor} from './processor';
import {Facilitator, PaymentEvent} from './facilitator';
import {McpBridge} from './mcp_bridge';
import {CONFIG, PLACEHOLDER_ADDRESS} from './config';
import {JobStore} from './utils/job_store';
import {Logger} from './utils/logger';
import {release as releaseEscrow} from './skills/escrow_skills';

export interface JobHandlerOptions {
  mcp?: McpBridge | null;
  jobStore?: JobStore;
  facilitator?: Facilitator | null;
}

/**
 * Serial job queue with durable idempotency. Proof submissions share one wallet
 * nonce, so concurrency is capped at 1 by default.
 *
 * When an optional McpBridge is provided (MCP_ENABLED=true), it is used for:
 *  1. Reputation gating (meta.agentNonce + MCP_MIN_REPUTATION)
 *  2. Tool-based processing (meta.mcpTool / meta.mcpArgs + allowlist)
 *  3. Gas price for proof submission
 */
const RATE_LIMIT_WINDOW_MS = 60_000;
function getRateLimitMax(): number {
  return parseInt(process.env.RATE_LIMIT_MAX_JOBS_PER_MIN || '20', 10);
}

export class JobHandler {
  private logger = new Logger('JobHandler');
  private queue: Promise<void> = Promise.resolve();
  private mcp: McpBridge | null;
  private jobStore: JobStore;
  private facilitator: Facilitator | null;
  private activeJobs = 0;
  private readonly maxConcurrency: number;
  private readonly callerWindows = new Map<
    string,
    {count: number; windowStart: number}
  >();

  constructor(
    private validator: Validator,
    private processor: JobProcessor,
    mcpOrOptions?: McpBridge | null | JobHandlerOptions,
  ) {
    if (
      mcpOrOptions &&
      typeof mcpOrOptions === 'object' &&
      ('jobStore' in mcpOrOptions ||
        'facilitator' in mcpOrOptions ||
        'mcp' in mcpOrOptions)
    ) {
      const opts = mcpOrOptions as JobHandlerOptions;
      this.mcp = opts.mcp ?? null;
      this.jobStore =
        opts.jobStore ??
        (process.env.NODE_ENV === 'test'
          ? new JobStore(
              path.join(os.tmpdir(), `moltbot-jobs-test-${process.pid}.db`),
            )
          : new JobStore());
      this.facilitator = opts.facilitator ?? null;
    } else {
      this.mcp = (mcpOrOptions as McpBridge | null | undefined) ?? null;
      // Tests construct without options — use a per-process tmp store so
      // parallel suites do not share .moltbot/jobs.db.
      this.jobStore =
        process.env.NODE_ENV === 'test'
          ? new JobStore(
              path.join(os.tmpdir(), `moltbot-jobs-test-${process.pid}.db`),
            )
          : new JobStore();
      this.facilitator = null;
    }
    this.maxConcurrency = parseInt(process.env.MAX_JOB_CONCURRENCY || '1', 10);
  }

  setFacilitator(facilitator: Facilitator): void {
    this.facilitator = facilitator;
  }

  /** Close the underlying job store DB. Call after drain() on shutdown. */
  closeStore(): void {
    this.jobStore.close();
  }

  private checkRateLimit(callerId: string): void {
    const now = Date.now();
    const entry = this.callerWindows.get(callerId);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      this.callerWindows.set(callerId, {count: 1, windowStart: now});
      return;
    }
    entry.count++;
    if (entry.count > getRateLimitMax()) {
      throw new Error(
        `Rate limit exceeded for caller ${callerId}: max ${getRateLimitMax()} jobs/min`,
      );
    }
  }

  /**
   * Wait for the current job queue to drain. Call during graceful shutdown
   * before process.exit() to avoid cutting off in-flight jobs.
   */
  async drain(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.activeJobs > 0 && Date.now() < deadline) {
      this.logger.info(`Draining: ${this.activeJobs} job(s) still active…`);
      await new Promise(r => setTimeout(r, 500));
    }
    await this.queue.catch(() => {});
  }

  /**
   * Enqueue a verified payment job. Completed jobs are skipped; failed/stale
   * jobs may be retried. Respects MAX_JOB_CONCURRENCY (default 1) and
   * RATE_LIMIT_MAX_JOBS_PER_MIN per caller.
   */
  enqueue(jobId: string, payment: PaymentEvent): void {
    const callerId = String(
      payment.meta?.agentNonce ?? payment.meta?.jobId ?? 'unknown',
    );
    try {
      this.checkRateLimit(callerId);
    } catch (err) {
      this.logger.warn((err as Error).message);
      return;
    }

    this.queue = this.queue
      .then(async () => {
        if (this.activeJobs >= this.maxConcurrency) {
          this.logger.warn(
            `Concurrency limit (${this.maxConcurrency}) reached; deferring job ${jobId}`,
          );
          await new Promise<void>(resolve => {
            const check = () => {
              if (this.activeJobs < this.maxConcurrency) {
                resolve();
              } else {
                setTimeout(check, 500);
              }
            };
            check();
          });
        }

        const proof =
          payment.txHash ||
          payment.meta?.txHash ||
          payment.meta?.paymentId ||
          payment.id;
        const claimed = await this.jobStore.claim(
          jobId,
          proof ? String(proof) : undefined,
        );
        if (!claimed) {
          this.logger.warn(`Skipping job ${jobId} (already claimed/completed)`);
          if (this.facilitator) {
            await this.facilitator.acknowledge(payment);
          }
          return;
        }

        this.activeJobs++;
        try {
          await this.handle(jobId, payment);
        } finally {
          this.activeJobs--;
        }
      })
      .catch(err => {
        this.logger.error(`Queued job ${jobId} failed`, err);
      });
  }

  async handle(jobId: string, payment: PaymentEvent) {
    this.logger.info(`Starting handler for ${jobId}`);

    try {
      await this.applyMcpReputationGate(payment);

      const resultHash = await this.processWithRetry(payment, 1);
      this.logger.info(`Result calculated for ${jobId}: ${resultHash}`);
      await this.submitWithRetry(jobId, resultHash, 1);
      await this.settleEscrowIfConfigured(jobId, payment);
      await this.jobStore.markCompleted(jobId, resultHash);
      if (this.facilitator) {
        await this.facilitator.acknowledge(payment);
      }
      this.logger.info(`Job ${jobId} COMPLETED successfully.`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`FATAL: Job ${jobId} failed after retries.`, err);
      await this.jobStore.markFailed(jobId, message);
    }
  }

  private async settleEscrowIfConfigured(
    jobId: string,
    payment: PaymentEvent,
  ): Promise<void> {
    if (!CONFIG.ESCROW_AUTO_RELEASE) return;
    if (payment.meta?.releaseEscrow === false) return;
    if (
      !CONFIG.ADDRESSES.ESCROW_CONTRACT ||
      CONFIG.ADDRESSES.ESCROW_CONTRACT === PLACEHOLDER_ADDRESS
    ) {
      return;
    }

    try {
      const txHash = await releaseEscrow(jobId);
      this.logger.info(`Escrow released for ${jobId}: ${txHash}`);
    } catch (err) {
      this.logger.warn(
        `Escrow release skipped/failed for ${jobId}: ${(err as Error).message}`,
      );
    }
  }

  private async applyMcpReputationGate(payment: PaymentEvent): Promise<void> {
    if (!this.mcp || CONFIG.MCP_MIN_REPUTATION <= 0) return;

    const rawNonce = payment.meta?.agentNonce;
    if (rawNonce === undefined || rawNonce === null) {
      throw new Error(
        `meta.agentNonce required when MCP_MIN_REPUTATION=${CONFIG.MCP_MIN_REPUTATION}`,
      );
    }

    const nonce = Number(rawNonce);
    if (!Number.isFinite(nonce)) {
      throw new Error(`Invalid meta.agentNonce: ${String(rawNonce)}`);
    }

    const score = await this.mcp.getAgentReputation(nonce);
    if (score === null) {
      throw new Error(
        `MCP reputation unavailable for agent #${nonce}; refusing job while MCP is enabled`,
      );
    }
    if (score < CONFIG.MCP_MIN_REPUTATION) {
      throw new Error(
        `Agent #${nonce} reputation ${score} below MCP_MIN_REPUTATION=${CONFIG.MCP_MIN_REPUTATION}`,
      );
    }
    this.logger.info(
      `MCP reputation gate passed for agent #${nonce}: score=${score}`,
    );
  }

  private assertMcpToolAllowed(toolName: string): void {
    const allowed = CONFIG.MCP_ALLOWED_TOOLS;
    if (allowed.includes('*')) return;
    if (allowed.length === 0) {
      throw new Error(
        `meta.mcpTool=${toolName} rejected: set MCP_ALLOWED_TOOLS (comma list or *)`,
      );
    }
    if (!allowed.includes(toolName)) {
      throw new Error(
        `meta.mcpTool=${toolName} not in MCP_ALLOWED_TOOLS=[${allowed.join(',')}]`,
      );
    }
  }

  private async processWithRetry(
    payment: PaymentEvent,
    attempt: number,
  ): Promise<string> {
    try {
      if (this.mcp && payment.meta?.mcpTool) {
        return await this.processViaMcp(payment);
      }

      const payload = payment.meta?.payload || '';
      return await this.processor.process({
        payload: payload,
        isUrl: payload.startsWith('http'),
      });
    } catch (e) {
      if (attempt >= CONFIG.RETRY.MAX_ATTEMPTS) {
        throw new Error(
          `Processing failed after ${attempt} attempts: ${(e as Error).message}`,
        );
      }
      this.logger.warn(`Processing attempt ${attempt} failed. Retrying...`);
      await this.delay(2000);
      return this.processWithRetry(payment, attempt + 1);
    }
  }

  private async processViaMcp(payment: PaymentEvent): Promise<string> {
    const toolName = String(payment.meta?.mcpTool);
    this.assertMcpToolAllowed(toolName);

    const args =
      payment.meta?.mcpArgs &&
      typeof payment.meta.mcpArgs === 'object' &&
      !Array.isArray(payment.meta.mcpArgs)
        ? (payment.meta.mcpArgs as Record<string, unknown>)
        : {payload: payment.meta?.payload || ''};

    this.logger.info(`Processing job via MCP tool: ${toolName}`);
    const result = await this.mcp!.callTool(toolName, args);
    const content = this.mcp!.formatToolResult(result);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async submitWithRetry(
    jobId: string,
    resultHash: string,
    attempt: number,
  ): Promise<void> {
    if (attempt > CONFIG.RETRY.MAX_ATTEMPTS) {
      throw new Error(`Submission failed after ${attempt - 1} attempts.`);
    }

    this.logger.info(`Submission attempt ${attempt} for job ${jobId}`);

    let gasPrice: string | undefined;
    if (this.mcp) {
      const mcpGas = await this.mcp.getGasPrice();
      if (mcpGas) {
        gasPrice = mcpGas;
      } else {
        this.logger.warn(
          'MCP gas price unavailable; using network default gas price',
        );
      }
    }

    let txHash: string;
    try {
      txHash = await this.validator.submitProof(jobId, resultHash, {gasPrice});
      this.logger.info(`Proof broadcasted. Tx: ${txHash}`);
    } catch (e) {
      this.logger.warn(
        `Broadcast failed (Attempt ${attempt}): ${(e as Error).message}`,
      );
      await this.delay(CONFIG.RETRY.SUBMISSION_DELAY);
      return this.submitWithRetry(jobId, resultHash, attempt + 1);
    }

    const success = await this.monitorTransaction(txHash);
    if (success) {
      return;
    }

    this.logger.warn(
      `Tx ${txHash} failed or timed out. Re-submitting job ${jobId}...`,
    );
    return this.submitWithRetry(jobId, resultHash, attempt + 1);
  }

  private async monitorTransaction(txHash: string): Promise<boolean> {
    const startTime = Date.now();
    const maxMonitorTime = 120000;
    let pollInterval = CONFIG.RETRY.CHECK_INTERVAL;
    let notFoundCount = 0;

    while (Date.now() - startTime < maxMonitorTime) {
      const status = await this.validator.getTxStatus(txHash);
      this.logger.info(`Monitoring ${txHash}: status is ${status}`);

      if (status === 'success' || status === 'successful') {
        return true;
      }

      if (status === 'fail' || status === 'failed' || status === 'invalid') {
        this.logger.error(`Tx ${txHash} confirmed failure: ${status}`);
        return false;
      }

      if (status === 'not_found') {
        notFoundCount++;
        if (notFoundCount > 10 && Date.now() - startTime > 30000) {
          this.logger.warn(
            `Tx ${txHash} not found for >30s. Considering broadcast failure.`,
          );
          return false;
        }
      } else {
        notFoundCount = 0;
      }

      await this.delay(pollInterval);
      pollInterval = Math.min(pollInterval + 1000, 10000);
    }

    this.logger.warn(`Monitoring ${txHash} timed out after 2 minutes.`);
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
