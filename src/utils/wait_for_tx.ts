import {createProvider} from '../chain';
import {CONFIG} from '../config';
import {Logger} from './logger';

const logger = new Logger('WaitForTx');

export interface WaitForTxOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

/**
 * Polls the network until a transaction succeeds, fails, or times out.
 * Returns true on success, false on failure/timeout.
 */
export async function waitForTxSuccess(
  txHash: string,
  options: WaitForTxOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollIntervalMs = options.pollIntervalMs ?? CONFIG.RETRY.CHECK_INTERVAL;
  const provider = createProvider('moltbot-wait-tx');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const tx = await provider.getTransaction(txHash);
      const status = tx.status.toString().toLowerCase();
      if (status === 'success' || status === 'successful') {
        return true;
      }
      if (status === 'fail' || status === 'failed' || status === 'invalid') {
        logger.warn(`Tx ${txHash} failed on-chain: ${status}`);
        return false;
      }
    } catch {
      // pending / not yet indexed
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  logger.warn(`Tx ${txHash} timed out after ${timeoutMs}ms`);
  return false;
}

export async function requireTxSuccess(
  txHash: string,
  options?: WaitForTxOptions,
): Promise<void> {
  const ok = await waitForTxSuccess(txHash, options);
  if (!ok) {
    throw new Error(`Transaction did not succeed: ${txHash}`);
  }
}
