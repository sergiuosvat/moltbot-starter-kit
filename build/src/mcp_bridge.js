"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpBridge = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("./utils/logger");
class McpBridge {
    baseUrl;
    logger = new logger_1.Logger('McpBridge');
    constructor(url) {
        this.baseUrl = url;
    }
    async getAgentReputation(nonce) {
        try {
            const res = await axios_1.default.get(`${this.baseUrl}/agents/${nonce}/reputation`);
            return res.data.score;
        }
        catch {
            this.logger.warn('Failed to fetch reputation, returning default 50');
            return 50;
        }
    }
    async getGasPrice() {
        try {
            const res = await axios_1.default.get(`${this.baseUrl}/network/economics`);
            return res.data.gasPrice;
        }
        catch {
            return '1000000000'; // Default
        }
    }
}
exports.McpBridge = McpBridge;
//# sourceMappingURL=mcp_bridge.js.map