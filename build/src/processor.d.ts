export interface JobRequest {
    payload: string;
    isUrl?: boolean;
}
export declare class JobProcessor {
    private logger;
    process(job: JobRequest): Promise<string>;
}
