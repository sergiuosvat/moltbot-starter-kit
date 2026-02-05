export interface PaymentEvent {
    amount: string;
    token: string;
    meta?: {
        jobId?: string;
        payload?: string;
        [key: string]: unknown;
    };
}
type PaymentCallback = (payment: PaymentEvent) => Promise<void>;
export declare class Facilitator {
    private listener;
    private pollingInterval;
    private facilitatorUrl;
    constructor(url?: string);
    onPayment(callback: PaymentCallback): void;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export {};
