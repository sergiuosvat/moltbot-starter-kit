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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobProcessor = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
class JobProcessor {
    logger = new logger_1.Logger('JobProcessor');
    async process(job) {
        let content = job.payload;
        if (job.isUrl || job.payload.startsWith('http')) {
            // SSRF Protection
            const url = new URL(job.payload);
            const isAllowed = config_1.CONFIG.SECURITY.ALLOWED_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
            if (!isAllowed) {
                throw new Error(`Domain not allowed: ${url.hostname}`);
            }
            try {
                this.logger.info(`Fetching job data from ${job.payload}...`);
                const res = await axios_1.default.get(job.payload, {
                    timeout: config_1.CONFIG.REQUEST_TIMEOUT,
                });
                content =
                    typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            }
            catch (e) {
                // Propagate error if it's the domain check, otherwise logging warning approach for availability
                if (e.message.includes('Domain not allowed'))
                    throw e;
                this.logger.warn('Failed to fetch URL, using raw payload');
            }
        }
        // Hash computation (SHA256)
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}
exports.JobProcessor = JobProcessor;
//# sourceMappingURL=processor.js.map