import { UserSigner } from "@multiversx/sdk-wallet";
import { Transaction, TransactionPayload, Address } from "@multiversx/sdk-core";
import { ApiNetworkProvider } from "@multiversx/sdk-network-providers";
import { promises as fs } from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

export class Validator {
    async submitProof(jobId: string, resultHash: string): Promise<string> {
        console.log(`Submitting proof for ${jobId}:hash=${resultHash}`);

        // 1. Setup Provider & Signer
        const providerUrl = process.env.MULTIVERSX_API_URL || "https://devnet-api.multiversx.com";
        const provider = new ApiNetworkProvider(providerUrl);

        const pemPath = process.env.MULTIVERSX_PRIVATE_KEY || path.resolve("wallet.pem");
        const pemContent = await fs.readFile(pemPath, "utf8");
        const signer = UserSigner.fromPem(pemContent);
        const senderAddress = signer.getAddress();

        // 2. Fetch Account State (Nonce)
        const account = await provider.getAccount(senderAddress);

        // 3. Construct Transaction
        // Pattern: submitProof@<job_id_hex>@<result_hash>
        const jobIdHex = Buffer.from(jobId).toString("hex");
        const data = new TransactionPayload(`submitProof@${jobIdHex}@${resultHash}`);

        const registryAddress = process.env.VALIDATION_REGISTRY_ADDRESS;
        if (!registryAddress) {
            // Fallback for test/demo if not in env, but warn
            console.warn("VALIDATION_REGISTRY_ADDRESS not set, utilizing default mock address");
        }
        const receiver = new Address(registryAddress || "erd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6gq4hu");

        const tx = new Transaction({
            nonce: BigInt(account.nonce), // Ensure BigInt
            value: "0",
            receiver: receiver,
            gasLimit: 10000000n, // Fixed safe limit
            chainID: process.env.MULTIVERSX_CHAIN_ID || "D",
            data: data,
            sender: senderAddress
        });

        // 4. Sign
        const serialized = tx.serializeForSigning();
        const signature = await signer.sign(serialized);
        tx.applySignature(signature);

        // 5. Broadcast
        const txHash = await provider.sendTransaction(tx);
        console.log(`Transaction sent: ${txHash}`);
        return txHash;
    }
}
