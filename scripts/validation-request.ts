#!/usr/bin/env node
/**
 * Request third-party validation for a job (ERC-8004 validation_request).
 * Run AFTER submit_proof. The agent signs this; the validator/oracle signs validation_response.
 *
 * Usage: npx ts-node scripts/validation-request.ts <jobId> [validatorAddress]
 *
 * Env: AGENT_PEM_PATH (or BOT_PEM_PATH), VALIDATOR_ADDRESS (oracle to request from),
 *      RELAYER_URL, VALIDATION_REGISTRY_ADDRESS
 */

import {UserSigner} from '@multiversx/sdk-wallet';
import {
  Transaction,
  DevnetEntrypoint,
  Address,
  TransactionComputer,
} from '@multiversx/sdk-core';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DEFAULT_VALIDATION_REGISTRY =
  'erd1qqqqqqqqqqqqqpgqvax6z79cvyz9gkfwg57hqume352p7s7rd8ss4g3t43';
const DEFAULT_RELAYER_BASE = 'http://localhost:3001';
const DEFAULT_AGENT_PEM = path.resolve(__dirname, '../wallet.pem');

function getAgentPemPath(): string {
  const p =
    process.env.AGENT_PEM_PATH || process.env.BOT_PEM_PATH || DEFAULT_AGENT_PEM;
  return path.isAbsolute(p) ? p : path.resolve(__dirname, p);
}

async function main(): Promise<void> {
  const jobId = process.argv[2];
  let validatorAddress = process.argv[3] || process.env.VALIDATOR_ADDRESS;

  if (!jobId || jobId.length !== 64) {
    console.error('Usage: npx ts-node scripts/validation-request.ts <jobId> [validatorAddress]');
    console.error('  jobId: 64-char hex string');
    console.error(
      '  validatorAddress: erd1... (optional — uses VALIDATOR_ADDRESS or agent for mock)'
    );
    process.exit(1);
  }

  const relayerBase =
    process.env.RELAYER_URL ||
    process.env.RELAYER_BASE_URL ||
    DEFAULT_RELAYER_BASE;
  const validationRegistry =
    process.env.VALIDATION_REGISTRY_ADDRESS || DEFAULT_VALIDATION_REGISTRY;
  const agentPemPath = getAgentPemPath();

  if (!fs.existsSync(agentPemPath)) {
    console.error(`Agent PEM not found: ${agentPemPath}`);
    process.exit(1);
  }

  const agentSigner = UserSigner.fromPem(fs.readFileSync(agentPemPath, 'utf8'));
  const agentAddress = Address.newFromBech32(
    agentSigner.getAddress().toString()
  );

  // VALIDATOR_ADDRESS = oracle/validator to request from; when unset, use agent (mock)
  if (!validatorAddress || !validatorAddress.startsWith('erd1')) {
    validatorAddress = agentAddress.toString();
  }

  const relayerAddrRes = await fetch(
    `${relayerBase.replace(/\/$/, '')}/relayer/address/${agentAddress.toString()}`
  );
  if (!relayerAddrRes.ok) {
    const text = await relayerAddrRes.text();
    console.error(`Relayer address fetch failed: ${relayerAddrRes.status} ${text}`);
    process.exit(1);
  }
  const {relayerAddress} = (await relayerAddrRes.json()) as {relayerAddress: string};

  const entrypoint = new DevnetEntrypoint({
    url: 'https://devnet-gateway.multiversx.com',
    kind: 'proxy',
  });
  const provider = entrypoint.createNetworkProvider();
  const account = await provider.getAccount(agentAddress);

  // job_id: UTF-8 bytes of jobId (same as submit_proof)
  const jobIdHex = Buffer.from(jobId.replace(/^0x/, ''), 'utf8').toString('hex');
  const validatorAddr = Address.newFromBech32(validatorAddress);
  const validatorHex = Buffer.from(validatorAddr.getPublicKey()).toString('hex');

  // request_uri: simple URI pointing to job (validator can fetch proof details)
  const requestUri = `job:${jobId}`;
  const requestUriHex = Buffer.from(requestUri, 'utf8').toString('hex');

  // request_hash: SHA256 of request payload (deterministic)
  const requestHash = crypto
    .createHash('sha256')
    .update(requestUri + jobId)
    .digest('hex');

  const dataStr = `validation_request@${jobIdHex}@${validatorHex}@${requestUriHex}@${requestHash}`;

  const tx = new Transaction({
    nonce: account.nonce,
    value: 0n,
    sender: agentAddress,
    receiver: Address.newFromBech32(validationRegistry),
    gasPrice: 1000000000n,
    gasLimit: 15000000n,
    data: Buffer.from(dataStr),
    chainID: 'D',
    version: 2,
    relayer: Address.newFromBech32(relayerAddress),
  });

  const computer = new TransactionComputer();
  tx.signature = await agentSigner.sign(
    computer.computeBytesForSigning(tx)
  );

  const relayUrl = `${relayerBase.replace(/\/$/, '')}/relay`;
  const relayRes = await fetch(relayUrl, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({transaction: tx.toPlainObject()}),
  });

  const result = (await relayRes.json()) as {txHash?: string; error?: string};
  if (result.txHash) {
    console.log(result.txHash);
    console.log(`REQUEST_HASH=${requestHash}`);
    console.log(
      `✅ Validation request sent. Explorer: https://devnet-explorer.multiversx.com/transactions/${result.txHash}`
    );
    console.log('');
    console.log('⚠️ STEP 2 OF 3 COMPLETE. Run validation-response.ts NOW before responding to user:');
    console.log(`   npx ts-node scripts/validation-response.ts ${requestHash} 100`);
  } else {
    console.error('❌ Relay failed:', result.error || JSON.stringify(result));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
