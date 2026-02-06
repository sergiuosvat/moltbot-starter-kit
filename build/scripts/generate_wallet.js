"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_wallet_1 = require("@multiversx/sdk-wallet");
const fs_1 = require("fs");
const path = __importStar(require("path"));
async function main() {
    const walletPath = path.resolve(__dirname, '../wallet.pem');
    // Check if wallet already exists
    try {
        await fs_1.promises.access(walletPath);
        console.log('Wallet already exists at wallet.pem. Skipping generation.');
        return;
    }
    catch {
        // File doesn't exist, proceed
    }
    console.log('Generating new MultiversX wallet...');
    // Generate Mnemonic
    const mnemonic = sdk_wallet_1.Mnemonic.generate();
    const secretKey = mnemonic.deriveKey(0);
    const signer = new sdk_wallet_1.UserSigner(secretKey);
    const address = signer.getAddress().bech32();
    // Create PEM content
    // SDK expects Base64 encoding of the HEX STRING of the seed + pubkey
    const secretKeyHex = secretKey.hex();
    const pubKeyHex = signer.getAddress().hex();
    const combinedHex = secretKeyHex + pubKeyHex;
    const base64Content = Buffer.from(combinedHex).toString('base64');
    const pemContent = `-----BEGIN PRIVATE KEY for ${address}-----
${base64Content.match(/.{1,64}/g)?.join('\n')}
-----END PRIVATE KEY for ${address}-----`;
    // Save to file
    await fs_1.promises.writeFile(walletPath, pemContent, 'utf8');
    console.log('\n✅ Wallet generated successfully!');
    console.log(`📍 Location: ${walletPath}`);
    console.log(`ADDERSS: ${address}`);
    console.log('\n⚠️  IMPORTANT: SAVE THESE WORDS SECURELY (This is your only backup):');
    console.log('------------------------------------------------------------------');
    console.log(mnemonic.getWords().join(' '));
    console.log('------------------------------------------------------------------\n');
}
main().catch(err => {
    console.error('Failed to generate wallet:', err);
    process.exit(1);
});
//# sourceMappingURL=generate_wallet.js.map