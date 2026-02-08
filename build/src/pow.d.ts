export interface Challenge {
    address: string;
    target: string;
    salt: string;
    difficulty: number;
    expiresAt: number;
}
export declare class PoWSolver {
    private logger;
    solve(challenge: Challenge): string;
    private checkDifficulty;
}
