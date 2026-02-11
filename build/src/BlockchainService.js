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
exports.BlockchainService = void 0;
const sdk_core_1 = require("@multiversx/sdk-core");
const config_1 = require("./config");
const identityAbiJson = __importStar(require("./abis/identity-registry.abi.json"));
const entrypoint_1 = require("./utils/entrypoint");
const abi_1 = require("./utils/abi");
class BlockchainService {
    identityController;
    constructor() {
        const entrypoint = (0, entrypoint_1.createEntrypoint)();
        const abi = (0, abi_1.createPatchedAbi)(identityAbiJson);
        this.identityController = entrypoint.createSmartContractController(abi);
    }
    async getAgentDetails(nonce) {
        const results = await this.identityController.query({
            contract: sdk_core_1.Address.newFromBech32(config_1.CONFIG.ADDRESSES.IDENTITY_REGISTRY),
            function: 'get_agent',
            arguments: [nonce],
        });
        if (!results[0]) {
            throw new Error(`Agent with nonce ${nonce} not found`);
        }
        return results[0];
    }
    async getAgentServicePrice(nonce, serviceId) {
        const results = await this.identityController.query({
            contract: sdk_core_1.Address.newFromBech32(config_1.CONFIG.ADDRESSES.IDENTITY_REGISTRY),
            function: 'get_agent_service_price',
            arguments: [nonce, Buffer.from(serviceId)],
        });
        const price = results[0];
        if (price === undefined || price === null) {
            return 0n; // Default: free service
        }
        return BigInt(price.toString());
    }
}
exports.BlockchainService = BlockchainService;
//# sourceMappingURL=BlockchainService.js.map