"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_wallet_1 = require("@multiversx/sdk-wallet");
const sdk_core_1 = require("@multiversx/sdk-core");
const fs_1 = require("fs");
// Usage: ts-node sign_x402_relayed.ts <pemPath> <receiver> <value> <nonce> <chainID> <relayerAddress> [data]
// Signs an x402 payment transaction with relayer field set (Relayed V3 compatible).
async function main() {
    const args = process.argv.slice(2);
    if (args.length < 6) {
        console.error('Usage: sign_x402_relayed.ts <pemPath> <receiver> <value> <nonce> <chainID> <relayerAddress> [data]');
        process.exit(1);
    }
    const [pemPath, receiver, value, nonceStr, chainID, relayerAddress, dataStr] = args;
    // 1. Load Signer
    const pemContent = await fs_1.promises.readFile(pemPath, 'utf8');
    const signer = sdk_wallet_1.UserSigner.fromPem(pemContent);
    const sender = signer.getAddress();
    // 2. Construct Transaction with relayer field (Relayed V3)
    const RELAYED_V3_EXTRA_GAS = 50000n;
    const BASE_GAS_LIMIT = 500000n;
    const tx = new sdk_core_1.Transaction({
        nonce: BigInt(nonceStr),
        value: BigInt(value),
        receiver: new sdk_core_1.Address(receiver),
        sender: new sdk_core_1.Address(sender.bech32()),
        relayer: new sdk_core_1.Address(relayerAddress), // Must set BEFORE signing
        gasPrice: 1000000000n,
        gasLimit: BASE_GAS_LIMIT + RELAYED_V3_EXTRA_GAS,
        data: dataStr ? Buffer.from(dataStr) : undefined,
        chainID: chainID,
        version: 2, // Must be >= 2 for Relayed V3
    });
    // 3. Sign (relayer field is part of signed bytes)
    const computer = new sdk_core_1.TransactionComputer();
    const serialized = computer.computeBytesForSigning(tx);
    const signature = await signer.sign(serialized);
    tx.signature = signature;
    // 4. Output Payload (compatible with x402 settle and /relay)
    const payload = {
        sender: sender.bech32(),
        receiver: receiver,
        value: value,
        nonce: parseInt(nonceStr),
        data: dataStr,
        signature: signature.toString('hex'),
        chainID: chainID,
        version: 2,
        options: 0,
        gasPrice: 1000000000,
        gasLimit: Number(BASE_GAS_LIMIT + RELAYED_V3_EXTRA_GAS),
        relayer: relayerAddress,
        validBefore: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };
    console.log(JSON.stringify(payload));
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=sign_x402_relayed.js.map