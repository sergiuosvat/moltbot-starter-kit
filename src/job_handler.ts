import {Validator} from './validator';
import {JobProcessor} from './processor';
import {PaymentEvent} from './facilitator';
import {CONFIG} from './config';

export class JobHandler {
  constructor(
    private validator: Validator,
    private processor: JobProcessor,
  ) {}

  async handle(jobId: string, payment: PaymentEvent) {
    console.log(`[JobHandler] Starting handler for ${jobId}`);

    try {
      // 1. Process with Retry
      const resultHash = await this.processWithRetry(payment, 1);
      console.log(`[JobHandler] Result calculated for ${jobId}: ${resultHash}`);

      // 2. Submit Proof with Retry & Monitoring
      await this.submitWithRetry(jobId, resultHash, 1);
    } catch (err) {
      console.error(
        `[JobHandler] FATAL: Job ${jobId} failed after retries.`,
        err,
      );
    }
  }

  private async processWithRetry(
    payment: PaymentEvent,
    attempt: number,
  ): Promise<string> {
    try {
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
      console.warn(
        `[JobHandler] Processing attempt ${attempt} failed. Retrying...`,
      );
      await this.delay(2000); // Short delay for processing retry
      return this.processWithRetry(payment, attempt + 1);
    }
  }

  private async submitWithRetry(
    jobId: string,
    resultHash: string,
    attempt: number,
  ): Promise<void> {
    if (attempt > CONFIG.RETRY.MAX_ATTEMPTS) {
      throw new Error(`Submission failed after ${attempt - 1} attempts.`);
    }

    console.log(`[JobHandler] Submission attempt ${attempt} for job ${jobId}`);

    let txHash: string;
    try {
      // 1. Broadcast (Always recreate/re-sign in submitProof if we wanted to be super safe,
      // but here we just call it which fetches nonce and signs)
      txHash = await this.validator.submitProof(jobId, resultHash);
      console.log(`[JobHandler] Proof broadcasted. Tx: ${txHash}`);
    } catch (e) {
      console.warn(
        `[JobHandler] Broadcast failed (Attempt ${attempt}): ${(e as Error).message}`,
      );
      await this.delay(CONFIG.RETRY.SUBMISSION_DELAY);
      return this.submitWithRetry(jobId, resultHash, attempt + 1);
    }

    // 2. Monitoring Phase
    const success = await this.monitorTransaction(txHash);
    if (success) {
      console.log(`[JobHandler] Job ${jobId} COMPLETED successfully.`);
      return;
    }

    // 3. Retry Phase (only if monitorTransaction failed or timed out)
    console.warn(
      `[JobHandler] Tx ${txHash} failed or timed out. Re-submitting job ${jobId}...`,
    );
    return this.submitWithRetry(jobId, resultHash, attempt + 1);
  }

  private async monitorTransaction(txHash: string): Promise<boolean> {
    const startTime = Date.now();
    const maxMonitorTime = 120000; // 2 minutes for cross-shard support
    let pollInterval = CONFIG.RETRY.CHECK_INTERVAL;
    let notFoundCount = 0;

    while (Date.now() - startTime < maxMonitorTime) {
      const status = await this.validator.getTxStatus(txHash);
      console.log(`[JobHandler] Monitoring ${txHash}: status is ${status}`);

      if (status === 'success' || status === 'successful') {
        return true;
      }

      if (status === 'fail' || status === 'failed' || status === 'invalid') {
        console.error(`[JobHandler] Tx ${txHash} confirmed failure: ${status}`);
        return false;
      }

      if (status === 'not_found') {
        notFoundCount++;
        // If not found for more than 30 seconds (assuming ~5-15 polls), could be a broadcast issue
        if (notFoundCount > 10 && Date.now() - startTime > 30000) {
          console.warn(
            `[JobHandler] Tx ${txHash} not found for >30s. Considering broadcast failure.`,
          );
          return false;
        }
      } else {
        notFoundCount = 0; // Reset if we see 'pending' or anything else
      }

      // If pending or unknown, wait and continue monitoring
      // We do NOT resend the transaction here.
      await this.delay(pollInterval);

      // Slightly increase poll interval (cap at 10s)
      pollInterval = Math.min(pollInterval + 1000, 10000);
    }

    console.warn(
      `[JobHandler] Monitoring ${txHash} timed out after 2 minutes.`,
    );
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
