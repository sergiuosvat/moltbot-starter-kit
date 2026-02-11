export declare class McpBridge {
    private baseUrl;
    private logger;
    constructor(url: string);
    getAgentReputation(nonce: number): Promise<number>;
    getGasPrice(): Promise<string>;
}
