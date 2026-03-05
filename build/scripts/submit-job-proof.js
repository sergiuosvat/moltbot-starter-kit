#!/usr/bin/env node
"use strict";
/**
 * Submit job proof directly (no MCP). Much faster than mcporter call multiversx.submit-job-proof.
 *
 * Usage: npx ts-node scripts/submit-job-proof.ts <jobId> [--standalone]
 *
 * Bot signs the tx, then sends to relayer for relay. Proof hash is SHA256("proof").
 * --standalone: submit only, no validation flow (omit to use as step 1 of validate-and-submit).
 * Env: BOT_PEM_PATH, RELAYER_URL, RELAYER_BASE_URL, VALIDATION_REGISTRY_ADDRESS
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_wallet_1 = require("@multiversx/sdk-wallet");
const sdk_core_1 = require("@multiversx/sdk-core");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DEFAULT_PROOF_HASH = crypto_1.default.createHash('sha256').update('proof').digest('hex');
const DEFAULT_VALIDATION_REGISTRY = 'erd1qqqqqqqqqqqqqpgqvax6z79cvyz9gkfwg57hqume352p7s7rd8ss4g3t43';
const DEFAULT_RELAYER_BASE = 'http://localhost:3001';
const DEFAULT_BOT_PEM = path_1.default.resolve(__dirname, '../wallet.pem');
function getBotPemPath() {
    const p = process.env.BOT_PEM_PATH || DEFAULT_BOT_PEM;
    return path_1.default.isAbsolute(p) ? p : path_1.default.resolve(__dirname, p);
}
async function main() {
    const jobId = process.argv[2];
    const standalone = process.argv.includes('--standalone');
    if (!jobId || jobId.length !== 64) {
        console.error('Usage: npx ts-node scripts/submit-job-proof.ts <jobId> [--standalone]');
        console.error('  jobId: 64-char hex string');
        console.error('  --standalone: submit only, no validation (omit when used as step 1 of validate-and-submit)');
        process.exit(1);
    }
    const proofHash = DEFAULT_PROOF_HASH;
    const relayerBase = process.env.RELAYER_URL ||
        process.env.RELAYER_BASE_URL ||
        DEFAULT_RELAYER_BASE;
    const validationRegistry = process.env.VALIDATION_REGISTRY_ADDRESS || DEFAULT_VALIDATION_REGISTRY;
    const botPemPath = getBotPemPath();
    if (!fs_1.default.existsSync(botPemPath)) {
        console.error(`Bot PEM not found: ${botPemPath}`);
        process.exit(1);
    }
    const botSigner = sdk_wallet_1.UserSigner.fromPem(fs_1.default.readFileSync(botPemPath, 'utf8'));
    const botAddress = sdk_core_1.Address.newFromBech32(botSigner.getAddress().toString());
    const relayerAddrRes = await fetch(`${relayerBase.replace(/\/$/, '')}/relayer/address/${botAddress.toBech32()}`);
    if (!relayerAddrRes.ok) {
        const text = await relayerAddrRes.text();
        console.error(`Relayer address fetch failed: ${relayerAddrRes.status} ${text}`);
        process.exit(1);
    }
    const { relayerAddress } = (await relayerAddrRes.json());
    const entrypoint = new sdk_core_1.DevnetEntrypoint({
        url: 'https://devnet-gateway.multiversx.com',
        kind: 'proxy',
    });
    const provider = entrypoint.createNetworkProvider();
    const account = await provider.getAccount(botAddress);
    // Match init_job encoding: job_id is stored as UTF-8 bytes of the hex string
    const jobIdHex = Buffer.from(jobId.replace(/^0x/, ''), 'utf8').toString('hex');
    const proofHashHex = proofHash.replace(/^0x/, '');
    const dataStr = `submit_proof@${jobIdHex}@${proofHashHex}`;
    const tx = new sdk_core_1.Transaction({
        nonce: account.nonce,
        value: 0n,
        sender: botAddress,
        receiver: sdk_core_1.Address.newFromBech32(validationRegistry),
        gasPrice: 1000000000n,
        gasLimit: 15000000n,
        data: Buffer.from(dataStr),
        chainID: 'D',
        version: 2,
        relayer: sdk_core_1.Address.newFromBech32(relayerAddress),
    });
    const computer = new sdk_core_1.TransactionComputer();
    tx.signature = await botSigner.sign(computer.computeBytesForSigning(tx));
    const relayUrl = `${relayerBase.replace(/\/$/, '')}/relay`;
    const relayRes = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: tx.toPlainObject() }),
    });
    const result = (await relayRes.json());
    if (result.txHash) {
        console.log(result.txHash);
        console.log(`✅ Proof submitted: https://devnet-explorer.multiversx.com/transactions/${result.txHash}`);
        if (!standalone) {
            console.log('');
            console.log('⚠️ STEP 1 OF 3 COMPLETE. Do NOT respond to user yet.');
            console.log('   Run validation-request.ts, then validation-response.ts with the REQUEST_HASH.');
            console.log('   Example: npx ts-node scripts/validation-request.ts ' + jobId);
        }
    }
    else {
        console.error('❌ Relay failed:', result.error || JSON.stringify(result));
        process.exit(1);
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=submit-job-proof.js.map