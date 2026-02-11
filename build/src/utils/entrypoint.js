"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEntrypoint = createEntrypoint;
const sdk_core_1 = require("@multiversx/sdk-core");
const config_1 = require("../config");
/**
 * Creates a network-aware entrypoint using CONFIG values.
 * This replaces the hardcoded DevnetEntrypoint usage across the codebase.
 */
function createEntrypoint() {
    return new sdk_core_1.NetworkEntrypoint({
        networkProviderUrl: config_1.CONFIG.API_URL,
        networkProviderKind: 'api',
        chainId: config_1.CONFIG.CHAIN_ID,
    });
}
//# sourceMappingURL=entrypoint.js.map