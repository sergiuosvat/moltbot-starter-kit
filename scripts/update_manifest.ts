import { UserSigner } from "@multiversx/sdk-wallet";
import { Transaction, TransactionPayload, Address } from "@multiversx/sdk-core";
import { ApiNetworkProvider } from "@multiversx/sdk-network-providers";
import { promises as fs } from "fs";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();

async function main() {
    console.log("🚀 Starting Manifest Update...");

    // 1. Setup Provider & Signer
    const providerUrl = process.env.MULTIVERSX_API_URL || "https://devnet-api.multiversx.com";
    const provider = new ApiNetworkProvider(providerUrl);

    const pemPath = process.env.MULTIVERSX_PRIVATE_KEY || path.resolve("wallet.pem");
    let pemContent = "";
    try {
        pemContent = await fs.readFile(pemPath, "utf8");
    } catch (e) {
        console.error("❌ Wallet not found at wallet.pem. Run setup.sh first.");
        process.exit(1);
    }

    const signer = UserSigner.fromPem(pemContent);
    const senderAddress = signer.getAddress();

    // 2. Load Config to get new details
    const configPath = path.resolve("config.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));

    console.log(`Updating Agent: ${config.agentName}`);
    console.log("New Capabilities:", config.capabilities);

    // 3. Construct Transaction
    // Endpoint: updateAgent
    // Arguments: [Name] (Optional if changing name, otherwise just pass same name)
    // We typically pass name to identify/validate, or just update metadata associated with sender.
    // Let's assume standard: updateAgent@<NameHex>

    const registryAddress = process.env.IDENTITY_REGISTRY_ADDRESS;
    if (!registryAddress) {
        console.warn("⚠️ IDENTITY_REGISTRY_ADDRESS not set. Using dummy address for safety.");
    }

    const account = await provider.getAccount(senderAddress);

    const nameHex = Buffer.from(config.agentName).toString("hex");
    const data = new TransactionPayload(`updateAgent@${nameHex}`);

    const tx = new Transaction({
        nonce: BigInt(account.nonce),
        value: "0",
        receiver: new Address(registryAddress || "erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu"),
        gasLimit: 10000000n,
        chainID: process.env.MULTIVERSX_CHAIN_ID || "D",
        data: data,
        sender: senderAddress
    });

    // 4. Sign
    const serialized = tx.serializeForSigning();
    const signature = await signer.sign(serialized);
    tx.applySignature(signature);

    console.log("Transaction Signed. Broadcasting...");

    // 5. Broadcast
    try {
        const txHash = await provider.sendTransaction(tx);
        console.log(`✅ Update Transaction Sent: ${txHash}`);
        console.log(`Check Explorer: https://devnet-explorer.multiversx.com/transactions/${txHash}`);
    } catch (e: any) {
        console.error("Failed to broadcast update:", e.message);
    }
}

main().catch(console.error);
