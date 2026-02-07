'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', {enumerable: true, value: v});
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', {value: true});
const sdk_network_providers_1 = require('@multiversx/sdk-network-providers');
const sdk_wallet_1 = require('@multiversx/sdk-wallet');
const fs_1 = require('fs');
const path = __importStar(require('path'));
const dotenv = __importStar(require('dotenv'));
dotenv.config();
async function main() {
  const walletPath =
    process.env.MULTIVERSX_PRIVATE_KEY ||
    path.resolve(__dirname, '../wallet.pem');
  try {
    const pemContent = await fs_1.promises.readFile(walletPath, 'utf8');
    const signer = sdk_wallet_1.UserSigner.fromPem(pemContent);
    const address = signer.getAddress();
    const providerUrl =
      process.env.MULTIVERSX_API_URL || 'https://devnet-api.multiversx.com';
    const provider = new sdk_network_providers_1.ApiNetworkProvider(
      providerUrl,
    );
    const account = await provider.getAccount(address);
    console.log(`\n🔍 Checking Balance for: ${address.bech32()}`);
    console.log(`🌍 Network: ${providerUrl}`);
    console.log(
      `💰 Balance: ${(BigInt(account.balance.toString()) / 1000000000000000000n).toString()} EGLD`,
    );
    console.log(`🔢 Nonce: ${account.nonce}`);
  } catch (error) {
    console.error('Error checking balance:', error);
  }
}
void main();
//# sourceMappingURL=check_balance.js.map
