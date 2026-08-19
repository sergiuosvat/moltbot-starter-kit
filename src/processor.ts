import axios from 'axios';
import * as crypto from 'crypto';
import {CONFIG} from './config';
import {Logger} from './utils/logger';
import {
  assertAllowedFetchUrl,
  assertResolvedPublicHost,
} from './utils/url_guard';

export interface JobRequest {
  payload: string;
  isUrl?: boolean;
}

export class JobProcessor {
  private logger = new Logger('JobProcessor');

  async process(job: JobRequest): Promise<string> {
    let content = job.payload;

    if (job.isUrl || job.payload.startsWith('http')) {
      assertAllowedFetchUrl(job.payload);
      await assertResolvedPublicHost(job.payload);

      this.logger.info(`Fetching job data from ${job.payload}...`);
      const res = await axios.get(job.payload, {
        timeout: CONFIG.REQUEST_TIMEOUT,
        maxRedirects: 0,
      });
      content =
        typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    }

    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
