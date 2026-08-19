/**
 * Additional JobStore tests exercising the SQLite backend:
 *  - markFailed allows re-claim (failed → claim again)
 *  - get() returns records from cache
 *  - close() + reopen preserves data
 *  - stale processing job is reclaimed
 *  - paymentProof preserved across markCompleted / markFailed
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import {JobStore} from '../src/utils/job_store';
import {CONFIG} from '../src/config';

function tmpPath(): string {
  return path.join(
    os.tmpdir(),
    `job-store-sqlite-${process.pid}-${Date.now()}.db`,
  );
}

function cleanup(dbPath: string): void {
  for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }
}

describe('JobStore — SQLite backend', () => {
  let dbPath: string;
  let store: JobStore;
  const originalStale = CONFIG.JOB_STALE_MS;

  beforeEach(() => {
    dbPath = tmpPath();
    store = new JobStore(dbPath);
    CONFIG.JOB_STALE_MS = 60_000;
  });

  afterEach(() => {
    store.close();
    CONFIG.JOB_STALE_MS = originalStale;
    cleanup(dbPath);
  });

  it('get() returns undefined for unknown job', async () => {
    expect(store.get('unknown')).toBeUndefined();
  });

  it('get() returns the record after claim', async () => {
    await store.claim('g1', 'proof');
    const rec = store.get('g1');
    expect(rec).toBeDefined();
    expect(rec!.status).toBe('processing');
    expect(rec!.paymentProof).toBe('proof');
  });

  it('failed job can be re-claimed', async () => {
    await store.claim('f1');
    await store.markFailed('f1', 'oops');
    const claimed = await store.claim('f1');
    expect(claimed).toBe(true);
    expect(store.get('f1')!.status).toBe('processing');
  });

  it('markFailed preserves paymentProof', async () => {
    await store.claim('f2', 'original-proof');
    await store.markFailed('f2', 'bad');
    expect(store.get('f2')!.paymentProof).toBe('original-proof');
  });

  it('markCompleted preserves paymentProof', async () => {
    await store.claim('c1', 'pay-proof');
    await store.markCompleted('c1', 'result-hash');
    const rec = store.get('c1')!;
    expect(rec.paymentProof).toBe('pay-proof');
    expect(rec.resultHash).toBe('result-hash');
    expect(rec.status).toBe('completed');
  });

  it('survives close + reopen (data persists in SQLite)', async () => {
    await store.claim('persist-1', 'proof-x');
    await store.markCompleted('persist-1', 'hash-y');
    store.close();

    const store2 = new JobStore(dbPath);
    const claimed = await store2.claim('persist-1');
    expect(claimed).toBe(false); // still completed

    const rec = store2.get('persist-1');
    expect(rec!.status).toBe('completed');
    expect(rec!.resultHash).toBe('hash-y');
    store2.close();
  });

  it('reclaims stale processing job', async () => {
    CONFIG.JOB_STALE_MS = 1;
    await store.claim('stale-1');
    await new Promise(r => setTimeout(r, 5));
    const claimed = await store.claim('stale-1');
    expect(claimed).toBe(true);
  });

  it('accepts a .json path and stores in .db instead', () => {
    const jsonPath = dbPath.replace(/\.db$/, '.json');
    const s = new JobStore(jsonPath);
    // Force open by reading
    expect(s.get('noop')).toBeUndefined();
    s.close();
    // .db file should exist, .json should not
    expect(fs.existsSync(dbPath)).toBe(true);
    expect(fs.existsSync(jsonPath)).toBe(false);
    cleanup(dbPath);
  });

  it('close() is idempotent', () => {
    store.close();
    expect(() => store.close()).not.toThrow();
  });
});
