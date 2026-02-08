"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_wallet_1 = require("@multiversx/sdk-wallet");
const sdk_core_1 = require("@multiversx/sdk-core");
const sdk_network_providers_1 = require("@multiversx/sdk-network-providers");
const fs_1 = __importDefault(require("fs"));
// Usage: ts-node fund.ts <pemPath> <receiver> <value> <chainId> <proxyUrl>
async function main() {
    const args = process.argv.slice(2);
    if (args.length < 5) {
        console.error('Usage: fund.ts <pemPath> <receiver> <value> <chainId> <proxyUrl>');
        process.exit(1);
    }
    const [pemPath, receiver, value, chainId, proxyUrl] = args;
    try {
        const pem = fs_1.default.readFileSync(pemPath, { encoding: 'utf-8' });
        const signer = sdk_wallet_1.UserSigner.fromPem(pem);
        const sender = signer.getAddress();
        const provider = new sdk_network_providers_1.ProxyNetworkProvider(proxyUrl);
        const account = await provider.getAccount(sender);
        console.log(`Sender: ${sender.bech32()}`);
        console.log(`Nonce: ${account.nonce}`);
        console.log(`Balance: ${account.balance.toString()}`);
        const tx = new sdk_core_1.Transaction({
            nonce: BigInt(account.nonce),
            value: BigInt(value),
            sender: new sdk_core_1.Address(sender.bech32()),
            receiver: new sdk_core_1.Address(receiver),
            gasLimit: 50000n,
            chainID: chainId,
            version: 1,
        });
        const computer = new sdk_core_1.TransactionComputer();
        const serialized = computer.computeBytesForSigning(tx);
        const signature = await signer.sign(serialized);
        tx.signature = signature;
        const hash = await provider.sendTransaction(tx);
        console.log(`Transaction submitted: ${hash}`);
    }
    catch (error) {
        console.error('Funding failed:', error);
        process.exit(1);
    }
}
main().catch(console.error);
//# sourceMappingURL=fund.js.map