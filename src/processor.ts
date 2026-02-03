import axios from "axios";
import * as crypto from "crypto";

export interface JobRequest {
    payload: string;
    isUrl?: boolean;
}

export class JobProcessor {
    async process(job: JobRequest): Promise<string> {
        let content = job.payload;

        if (job.isUrl || job.payload.startsWith("http")) {
            try {
                console.log(`Fetching job data from ${job.payload}...`);
                const res = await axios.get(job.payload);
                content = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            } catch (e) {
                console.warn("Failed to fetch URL, using raw payload");
            }
        }

        // Hash computation (SHA256)
        return crypto.createHash('sha256').update(content).digest('hex');
    }
}
