#!/usr/bin/env node
"use strict";
/**
 * Validator/oracle responds to a validation request (ERC-8004 validation_response).
 * In production: third-party validator signs with VALIDATOR_PEM_PATH.
 * For mocking: omit VALIDATOR_PEM_PATH to use BOT_PEM_PATH (agent wallet).
 *
 * Usage: npx ts-node scripts/validation-response.ts <requestHash> <score> [responseUri] [tag]
 *
 * Env: VALIDATOR_PEM_PATH (oracle/validator), BOT_PEM_PATH (mock fallback),
 *      RELAYER_URL, VALIDATION_REGISTRY_ADDRESS
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
const DEFAULT_VALIDATION_REGISTRY = 'erd1qqqqqqqqqqqqqpgqvax6z79cvyz9gkfwg57hqume352p7s7rd8ss4g3t43';
const DEFAULT_RELAYER_BASE = 'http://localhost:3001';
const DEFAULT_BOT_PEM = path_1.default.resolve(__dirname, '../wallet.pem');
function getValidatorPemPath() {
    const p = process.env.VALIDATOR_PEM_PATH ||
        process.env.ORACLE_PEM_PATH ||
        process.env.BOT_PEM_PATH ||
        DEFAULT_BOT_PEM;
    return path_1.default.isAbsolute(p) ? p : path_1.default.resolve(__dirname, p);
}
async function main() {
    const requestHash = process.argv[2];
    const score = parseInt(process.argv[3], 10);
    const responseUri = process.argv[4] || 'validated';
    const tag = process.argv[5] || 'v1';
    if (!requestHash || requestHash.length !== 64) {
        console.error('Usage: npx ts-node scripts/validation-response.ts <requestHash> <score> [responseUri] [tag]');
        console.error('  requestHash: 64-char hex (from validation_request output)');
        console.error('  score: 0-100');
        process.exit(1);
    }
    if (isNaN(score) || score < 0 || score > 100) {
        console.error('Score must be 0-100');
        process.exit(1);
    }
    const relayerBase = process.env.RELAYER_URL ||
        process.env.RELAYER_BASE_URL ||
        DEFAULT_RELAYER_BASE;
    const validationRegistry = process.env.VALIDATION_REGISTRY_ADDRESS || DEFAULT_VALIDATION_REGISTRY;
    const validatorPemPath = getValidatorPemPath();
    if (!fs_1.default.existsSync(validatorPemPath)) {
        console.error(`Validator PEM not found: ${validatorPemPath}`);
        process.exit(1);
    }
    const validatorSigner = sdk_wallet_1.UserSigner.fromPem(fs_1.default.readFileSync(validatorPemPath, 'utf8'));
    const validatorAddress = sdk_core_1.Address.newFromBech32(validatorSigner.getAddress().toString());
    const relayerAddrRes = await fetch(`${relayerBase.replace(/\/$/, '')}/relayer/address/${validatorAddress.toString()}`);
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
    const account = await provider.getAccount(validatorAddress);
    const requestHashHex = requestHash.replace(/^0x/, '');
    const scoreHex = score.toString(16).padStart(2, '0');
    const responseUriHex = Buffer.from(responseUri, 'utf8').toString('hex');
    const responseHash = crypto_1.default
        .createHash('sha256')
        .update(responseUri + score.toString())
        .digest('hex');
    const tagHex = Buffer.from(tag, 'utf8').toString('hex');
    const dataStr = `validation_response@${requestHashHex}@${scoreHex}@${responseUriHex}@${responseHash}@${tagHex}`;
    const tx = new sdk_core_1.Transaction({
        nonce: account.nonce,
        value: 0n,
        sender: validatorAddress,
        receiver: sdk_core_1.Address.newFromBech32(validationRegistry),
        gasPrice: 1000000000n,
        gasLimit: 15000000n,
        data: Buffer.from(dataStr),
        chainID: 'D',
        version: 2,
        relayer: sdk_core_1.Address.newFromBech32(relayerAddress),
    });
    const computer = new sdk_core_1.TransactionComputer();
    tx.signature = await validatorSigner.sign(computer.computeBytesForSigning(tx));
    const relayUrl = `${relayerBase.replace(/\/$/, '')}/relay`;
    const relayRes = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: tx.toPlainObject() }),
    });
    const result = (await relayRes.json());
    if (result.txHash) {
        console.log(result.txHash);
        console.error(`✅ Validation response sent (score: ${score})`);
        console.error(`   Explorer: https://devnet-explorer.multiversx.com/transactions/${result.txHash}`);
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
//# sourceMappingURL=validation-response.js.map