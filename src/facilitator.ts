import axios from "axios";

export interface PaymentEvent {
    amount: string;
    token: string;
    meta: any;
}

type PaymentCallback = (payment: PaymentEvent) => Promise<void>;

export class Facilitator {
    private listener: PaymentCallback | null = null;
    private pollingInterval: NodeJS.Timeout | null = null;
    private facilitatorUrl: string;

    constructor(url?: string) {
        this.facilitatorUrl = url || process.env.X402_FACILITATOR_URL || "http://localhost:4000";
    }

    onPayment(callback: PaymentCallback) {
        this.listener = callback;
    }

    async start() {
        console.log(`Facilitator Listener attached to ${this.facilitatorUrl}`);

        this.pollingInterval = setInterval(async () => {
            if (!this.listener) return;
            try {
                const res = await axios.get(`${this.facilitatorUrl}/events?unread=true`);
                const events = res.data;
                if (Array.isArray(events)) {
                    for (const payment of events) {
                        // Validate structure if needed, or assume trusted source
                        await this.listener(payment);
                    }
                }
            } catch (e: any) {
                // Suppress connection error logs during tests often, but log warn in prod
                // console.warn("Facilitator poll failed:", e.message);
            }
        }, 5000);
    }

    async stop() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
    }
}
