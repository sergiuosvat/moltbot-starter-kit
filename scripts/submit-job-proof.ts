#!/usr/bin/env node
/**
 * Submit job proof via the validation skill (chain layer).
 *
 * Usage: npx ts-node scripts/submit-job-proof.ts <jobId> [--standalone]
 */

import crypto from 'crypto';
import {CONFIG} from '../src/config';
import {submitProof} from '../src/skills/validation_skills';

const DEFAULT_PROOF_HASH = crypto
  .createHash('sha256')
  .update('proof')
  .digest('hex');

async function main(): Promise<void> {
  const jobId = process.argv[2];
  const standalone = process.argv.includes('--standalone');

  if (!jobId || jobId.length !== 64) {
    console.error(
      'Usage: npx ts-node scripts/submit-job-proof.ts <jobId> [--standalone]',
    );
    console.error('  jobId: 64-char hex string');
    process.exit(1);
  }

  console.log(`Submitting proof for job: ${jobId}`);
  const txHash = await submitProof({
    jobId,
    proofHash: DEFAULT_PROOF_HASH,
    useRelayer: true,
  });

  console.log(txHash);
  console.log(
    `✅ Proof submitted: ${CONFIG.EXPLORER_URL}/transactions/${txHash}`,
  );

  if (!standalone) {
    console.log('\n⚠️ STEP 1 OF 3 COMPLETE. Do NOT respond to user yet.');
    console.log(
      '   Run validation-request.ts, then validation-response.ts with the REQUEST_HASH.',
    );
    console.log(
      `   Example: npx ts-node scripts/validation-request.ts ${jobId}`,
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
