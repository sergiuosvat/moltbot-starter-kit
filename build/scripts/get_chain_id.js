"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_network_providers_1 = require("@multiversx/sdk-network-providers");
// Usage: ts-node get_chain_id.ts <proxyUrl>
const url = process.argv[2];
if (!url) {
    console.error('Usage: ts-node get_chain_id.ts <proxyUrl>');
    process.exit(1);
}
void (async () => {
    try {
        const provider = new sdk_network_providers_1.ProxyNetworkProvider(url);
        const config = await provider.getNetworkConfig();
        console.log(config.ChainID);
    }
    catch (error) {
        console.error('Failed to get chainID:', error);
        process.exit(1);
    }
})();
//# sourceMappingURL=get_chain_id.js.map