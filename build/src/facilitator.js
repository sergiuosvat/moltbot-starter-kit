"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Facilitator = void 0;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
class Facilitator {
    listener = null;
    pollingInterval = null;
    facilitatorUrl;
    logger = new logger_1.Logger('Facilitator');
    constructor(url) {
        this.facilitatorUrl = url || config_1.CONFIG.PROVIDERS.FACILITATOR_URL;
    }
    onPayment(callback) {
        this.listener = callback;
    }
    async start() {
        this.logger.info(`Listener attached to ${this.facilitatorUrl}`);
        this.pollingInterval = setInterval(async () => {
            if (!this.listener)
                return;
            try {
                const res = await axios_1.default.get(`${this.facilitatorUrl}/events?unread=true`);
                const events = res.data;
                if (Array.isArray(events)) {
                    for (const payment of events) {
                        // Validate structure if needed, or assume trusted source
                        await this.listener(payment);
                    }
                }
            }
            catch (e) {
                this.logger.warn(`Facilitator poll failed: ${e.message}`);
            }
        }, 5000);
    }
    async stop() {
        if (this.pollingInterval)
            clearInterval(this.pollingInterval);
    }
    async prepare(request) {
        const res = await axios_1.default.post(`${this.facilitatorUrl}/prepare`, request);
        return res.data;
    }
    async settle(payload) {
        const res = await axios_1.default.post(`${this.facilitatorUrl}/settle`, {
            scheme: 'exact',
            payload,
            requirements: {
                payTo: payload.receiver,
                amount: payload.value,
                asset: 'EGLD',
                network: config_1.CONFIG.CHAIN_ID,
            },
        });
        return res.data;
    }
}
exports.Facilitator = Facilitator;
//# sourceMappingURL=facilitator.js.map