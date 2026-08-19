/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for new job_handler features:
 *  - ACK on already-completed duplicate delivery
 *  - Per-caller rate limiting
 *  - drain() waits for active jobs
 *  - closeStore() delegates to JobStore
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import {JobHandler} from '../src/job_handler';
import {Validator} from '../src/validator';
import {JobProcessor} from '../src/processor';
import {JobStore} from '../src/utils/job_store';
import {Facilitator} from '../src/facilitator';

jest.useFakeTimers();

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    amount: '1',
    token: 'EGLD',
    meta: {jobId: 'j1', payload: 'data'},
    ...overrides,
  };
}

function makeDeps(storeFile?: string) {
  const validator = new Validator();
  const processor = new JobProcessor();
  const dbPath =
    storeFile ??
    path.join(os.tmpdir(), `jh-new-test-${process.pid}-${Date.now()}.db`);
  const jobStore = new JobStore(dbPath);
  return {validator, processor, jobStore, dbPath};
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('JobHandler — ACK on duplicate delivery', () => {
  it('ACKs the facilitator when a job is already completed', async () => {
    const {validator, processor, jobStore, dbPath} = makeDeps();
    const facilitator = new Facilitator('http://mock');
    const ackSpy = jest
      .spyOn(facilitator, 'acknowledge')
      .mockResolvedValue(undefined);

    const handler = new JobHandler(validator, processor, {
      jobStore,
      facilitator,
    });

    // Pre-mark the job as completed so claim() returns false
    await jobStore.claim('dup-job', 'proof-1');
    await jobStore.markCompleted('dup-job', 'hash-abc');

    const payment = makePayment({id: 'proof-1', meta: {jobId: 'dup-job', payload: 'x'}});
    handler.enqueue('dup-job', payment as any);

    // Drain the queue promise directly
    await handler.drain(500);
    await jest.runAllTimersAsync();

    expect(ackSpy).toHaveBeenCalledWith(payment);

    handler.closeStore();
    fs.rmSync(dbPath, {force: true});
  });
});

describe('JobHandler — rate limiting', () => {
  it('drops jobs when caller exceeds rate limit', () => {
    const originalEnv = process.env.RATE_LIMIT_MAX_JOBS_PER_MIN;
    process.env.RATE_LIMIT_MAX_JOBS_PER_MIN = '2';
    const {validator, processor, jobStore, dbPath} = makeDeps();
    const handler = new JobHandler(validator, processor, {jobStore});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const payment = makePayment({meta: {agentNonce: 99, payload: 'x'}});

    // First two pass the rate check, third is dropped synchronously
    handler.enqueue('r1', payment as any);
    handler.enqueue('r2', payment as any);
    handler.enqueue('r3', payment as any); // dropped

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rate limit exceeded'),
    );

    warnSpy.mockRestore();
    handler.closeStore();
    fs.rmSync(dbPath, {force: true});
    process.env.RATE_LIMIT_MAX_JOBS_PER_MIN = originalEnv;
  });

  it('resets rate limit window after expiry', () => {
    const originalEnv = process.env.RATE_LIMIT_MAX_JOBS_PER_MIN;
    process.env.RATE_LIMIT_MAX_JOBS_PER_MIN = '1';
    const {validator, processor, jobStore, dbPath} = makeDeps();
    const handler = new JobHandler(validator, processor, {jobStore});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const payment = makePayment({meta: {agentNonce: 77, payload: 'x'}});

    handler.enqueue('window-1', payment as any); // allowed
    handler.enqueue('window-2', payment as any); // dropped — rate limited

    const warnBefore = warnSpy.mock.calls.filter(c =>
      String(c[0]).includes('Rate limit'),
    ).length;
    expect(warnBefore).toBe(1);

    // Advance time past the 60s window
    jest.advanceTimersByTime(61_000);

    handler.enqueue('window-3', payment as any); // allowed after window reset

    const warnAfter = warnSpy.mock.calls.filter(c =>
      String(c[0]).includes('Rate limit'),
    ).length;
    expect(warnAfter).toBe(1); // no new rate-limit warn after reset

    warnSpy.mockRestore();
    handler.closeStore();
    fs.rmSync(dbPath, {force: true});
    process.env.RATE_LIMIT_MAX_JOBS_PER_MIN = originalEnv;
  });
});

describe('JobHandler — drain()', () => {
  it('resolves immediately when no jobs are active', async () => {
    const {validator, processor, jobStore, dbPath} = makeDeps();
    const handler = new JobHandler(validator, processor, {jobStore});

    const drainPromise = handler.drain(1000);
    await jest.runAllTimersAsync();
    await expect(drainPromise).resolves.toBeUndefined();

    handler.closeStore();
    fs.rmSync(dbPath, {force: true});
  });
});

describe('JobHandler — closeStore()', () => {
  it('calls close on the underlying JobStore', async () => {
    const {validator, processor, jobStore, dbPath} = makeDeps();
    const closeSpy = jest.spyOn(jobStore, 'close');
    const handler = new JobHandler(validator, processor, {jobStore});

    handler.closeStore();

    expect(closeSpy).toHaveBeenCalled();
    fs.rmSync(dbPath, {force: true});
  });
});

describe('JobHandler — enqueue caller ID fallback', () => {
  it('uses meta.jobId as caller when agentNonce absent', () => {
    const originalEnv = process.env.RATE_LIMIT_MAX_JOBS_PER_MIN;
    process.env.RATE_LIMIT_MAX_JOBS_PER_MIN = '1';
    const {validator, processor, jobStore, dbPath} = makeDeps();
    const handler = new JobHandler(validator, processor, {jobStore});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const payment = makePayment({meta: {jobId: 'caller-id', payload: 'x'}});
    handler.enqueue('cid-1', payment as any);
    handler.enqueue('cid-2', payment as any); // same caller, rate limited

    expect(
      warnSpy.mock.calls.some(c => String(c[0]).includes('Rate limit')),
    ).toBe(true);

    warnSpy.mockRestore();
    handler.closeStore();
    fs.rmSync(dbPath, {force: true});
    process.env.RATE_LIMIT_MAX_JOBS_PER_MIN = originalEnv;
  });
});
