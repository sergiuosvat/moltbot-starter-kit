import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {JobStore} from '../src/utils/job_store';
import {CONFIG} from '../src/config';

describe('JobStore', () => {
  let filePath: string;
  let store: JobStore;
  const originalStale = CONFIG.JOB_STALE_MS;

  beforeEach(() => {
    filePath = path.join(
      os.tmpdir(),
      `job-store-test-${process.pid}-${Date.now()}.json`,
    );
    store = new JobStore(filePath);
    CONFIG.JOB_STALE_MS = 60_000;
  });

  afterEach(() => {
    store.close();
    CONFIG.JOB_STALE_MS = originalStale;
    const dbPath = filePath.replace(/\.json$/, '.db');
    for (const p of [filePath, dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(p);
      } catch {
        // ignore
      }
    }
  });

  it('claims a new job and skips while processing', async () => {
    await expect(store.claim('job-1')).resolves.toBe(true);
    await expect(store.claim('job-1')).resolves.toBe(false);
  });

  it('skips completed jobs and allows retry after failure', async () => {
    await store.claim('job-2');
    await store.markCompleted('job-2', 'hash');
    await expect(store.claim('job-2')).resolves.toBe(false);

    await store.claim('job-3');
    await store.markFailed('job-3', 'boom');
    await expect(store.claim('job-3')).resolves.toBe(true);
  });

  it('persists across instances', async () => {
    await store.claim('job-4');
    await store.markCompleted('job-4', 'abc');
    store.close();

    const again = new JobStore(filePath);
    await expect(again.claim('job-4')).resolves.toBe(false);
    again.close();
  });

  it('reclaims stale processing jobs', async () => {
    CONFIG.JOB_STALE_MS = 1;
    await store.claim('job-5');
    await new Promise(r => setTimeout(r, 5));
    await expect(store.claim('job-5')).resolves.toBe(true);
  });
});
