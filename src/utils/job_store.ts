import * as fs from 'fs';
import * as path from 'path';

import Database from 'better-sqlite3';

import {CONFIG} from '../config';
import {Logger} from './logger';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobRecord {
  jobId: string;
  status: JobStatus;
  updatedAt: number;
  error?: string;
  resultHash?: string;
  paymentProof?: string;
}

interface JobRow {
  job_id: string;
  status: string;
  updated_at: number;
  error: string | null;
  result_hash: string | null;
  payment_proof: string | null;
}

function rowToRecord(row: JobRow): JobRecord {
  return {
    jobId: row.job_id,
    status: row.status as JobStatus,
    updatedAt: row.updated_at,
    error: row.error ?? undefined,
    resultHash: row.result_hash ?? undefined,
    paymentProof: row.payment_proof ?? undefined,
  };
}

/**
 * SQLite-backed job ledger for idempotency across process restarts.
 * completed → never retry; failed/stale processing → may claim again.
 *
 * Uses better-sqlite3 (synchronous API) so writes are immediately durable
 * without async complexity. An in-memory Map is kept as a fast read cache.
 */
export class JobStore {
  private logger = new Logger('JobStore');
  private db: Database.Database | null = null;
  private cache = new Map<string, JobRecord>();
  private readonly dbPath: string;

  constructor(filePath: string = CONFIG.JOB_STORE_PATH) {
    // Accept a .json path for backwards-compatibility — swap extension to .db
    this.dbPath = filePath.replace(/\.json$/, '.db');
  }

  private openDb(): Database.Database {
    if (this.db) return this.db;

    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, {recursive: true});

    const db = new Database(this.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        job_id       TEXT PRIMARY KEY,
        status       TEXT NOT NULL,
        updated_at   INTEGER NOT NULL,
        error        TEXT,
        result_hash  TEXT,
        payment_proof TEXT
      );
    `);

    const rows = db.prepare('SELECT * FROM jobs').all() as JobRow[];
    for (const row of rows) {
      this.cache.set(row.job_id, rowToRecord(row));
    }

    this.logger.info(
      `SQLite job store opened (${this.cache.size} record(s)) at ${this.dbPath}`,
    );

    this.db = db;
    return db;
  }

  /** Expose for testing — allows injecting an in-memory DB path. */
  get(jobId: string): JobRecord | undefined {
    this.openDb();
    return this.cache.get(jobId);
  }

  /**
   * Atomically claim a job for processing. Returns false if it should be skipped.
   */
  async claim(jobId: string, paymentProof?: string): Promise<boolean> {
    const db = this.openDb();
    const existing = this.cache.get(jobId);
    const now = Date.now();

    if (existing?.status === 'completed') {
      return false;
    }

    if (existing?.status === 'processing') {
      const age = now - existing.updatedAt;
      if (age < CONFIG.JOB_STALE_MS) {
        return false;
      }
      this.logger.warn(
        `Reclaiming stale processing job ${jobId} (age=${age}ms)`,
      );
    }

    const record: JobRecord = {
      jobId,
      status: 'processing',
      updatedAt: now,
      paymentProof,
      error: undefined,
      resultHash: undefined,
    };

    db.prepare(
      `INSERT INTO jobs (job_id, status, updated_at, payment_proof, error, result_hash)
       VALUES (@jobId, @status, @updatedAt, @paymentProof, NULL, NULL)
       ON CONFLICT(job_id) DO UPDATE SET
         status = excluded.status,
         updated_at = excluded.updated_at,
         payment_proof = excluded.payment_proof,
         error = NULL,
         result_hash = NULL`,
    ).run({
      jobId,
      status: 'processing',
      updatedAt: now,
      paymentProof: paymentProof ?? null,
    });

    this.cache.set(jobId, record);
    return true;
  }

  async markCompleted(jobId: string, resultHash?: string): Promise<void> {
    const db = this.openDb();
    const prev = this.cache.get(jobId);
    const now = Date.now();

    db.prepare(
      `INSERT INTO jobs (job_id, status, updated_at, result_hash, payment_proof, error)
       VALUES (@jobId, 'completed', @updatedAt, @resultHash, @paymentProof, NULL)
       ON CONFLICT(job_id) DO UPDATE SET
         status = 'completed',
         updated_at = excluded.updated_at,
         result_hash = excluded.result_hash,
         error = NULL`,
    ).run({
      jobId,
      updatedAt: now,
      resultHash: resultHash ?? null,
      paymentProof: prev?.paymentProof ?? null,
    });

    this.cache.set(jobId, {
      jobId,
      status: 'completed',
      updatedAt: now,
      resultHash,
      paymentProof: prev?.paymentProof,
    });
  }

  async markFailed(jobId: string, error: string): Promise<void> {
    const db = this.openDb();
    const prev = this.cache.get(jobId);
    const now = Date.now();

    db.prepare(
      `INSERT INTO jobs (job_id, status, updated_at, error, payment_proof, result_hash)
       VALUES (@jobId, 'failed', @updatedAt, @error, @paymentProof, NULL)
       ON CONFLICT(job_id) DO UPDATE SET
         status = 'failed',
         updated_at = excluded.updated_at,
         error = excluded.error`,
    ).run({
      jobId,
      updatedAt: now,
      error,
      paymentProof: prev?.paymentProof ?? null,
    });

    this.cache.set(jobId, {
      jobId,
      status: 'failed',
      updatedAt: now,
      error,
      paymentProof: prev?.paymentProof,
    });
  }

  /** Clean up — call on process shutdown if desired. */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
