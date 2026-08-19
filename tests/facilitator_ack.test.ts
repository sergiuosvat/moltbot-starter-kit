/**
 * Tests for Facilitator.acknowledge() retry/backoff logic added in this session.
 */
import {Facilitator} from '../src/facilitator';
import axios from 'axios';

jest.mock('axios');
jest.useFakeTimers();

const mockedPost = axios.post as jest.Mock;

describe('Facilitator.acknowledge()', () => {
  let facilitator: Facilitator;

  beforeEach(() => {
    jest.clearAllMocks();
    facilitator = new Facilitator('http://mock-fac');
  });

  afterEach(async () => {
    await facilitator.stop();
  });

  it('ACKs via /events path on first attempt', async () => {
    mockedPost.mockResolvedValueOnce({status: 200});

    const p = facilitator.acknowledge({
      id: 'evt-1',
      amount: '1',
      token: 'EGLD',
    });
    await jest.runAllTimersAsync();
    await p;

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost).toHaveBeenCalledWith(
      expect.stringContaining('/events/evt-1/ack'),
      {},
      expect.any(Object),
    );
  });

  it('falls through to /payments path when /events returns 404', async () => {
    mockedPost
      .mockResolvedValueOnce({status: 404}) // /events 404
      .mockResolvedValueOnce({status: 200}); // /payments 200

    const p = facilitator.acknowledge({
      id: 'tx-99',
      amount: '1',
      token: 'EGLD',
    });
    await jest.runAllTimersAsync();
    await p;

    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(mockedPost).toHaveBeenLastCalledWith(
      expect.stringContaining('/payments/tx-99/ack'),
      {},
      expect.any(Object),
    );
  });

  it('retries on network error and eventually succeeds', async () => {
    mockedPost
      .mockRejectedValueOnce(new Error('ECONNRESET')) // attempt 1 /events
      .mockRejectedValueOnce(new Error('ECONNRESET')) // attempt 1 /payments
      .mockResolvedValueOnce({status: 200}); // attempt 2 /events

    const p = facilitator.acknowledge({
      txHash: 'hash-abc',
      amount: '1',
      token: 'EGLD',
    });
    await jest.runAllTimersAsync();
    await p;

    expect(mockedPost).toHaveBeenCalledTimes(3);
  });

  it('warns and gives up after max retry attempts', async () => {
    mockedPost.mockRejectedValue(new Error('network down'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const p = facilitator.acknowledge({
      id: 'stuck-evt',
      amount: '1',
      token: 'EGLD',
    });
    await jest.runAllTimersAsync();
    await p;

    // 3 attempts × 2 paths = 6 calls total
    expect(mockedPost).toHaveBeenCalledTimes(6);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to ACK payment stuck-evt'),
    );
    warnSpy.mockRestore();
  });

  it('warns immediately when payment has no id/proof', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await facilitator.acknowledge({amount: '1', token: 'EGLD'});

    expect(mockedPost).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot ACK payment'),
    );
    warnSpy.mockRestore();
  });

  it('uses meta.txHash as id when top-level id missing', async () => {
    mockedPost.mockResolvedValueOnce({status: 200});

    const p = facilitator.acknowledge({
      amount: '1',
      token: 'EGLD',
      meta: {txHash: 'meta-hash-xyz'},
    });
    await jest.runAllTimersAsync();
    await p;

    expect(mockedPost).toHaveBeenCalledWith(
      expect.stringContaining('meta-hash-xyz'),
      {},
      expect.any(Object),
    );
  });

  it('logs a warning when ACK returns a non-2xx non-404 status', async () => {
    mockedPost.mockResolvedValue({status: 500}); // never hits 2xx/404 branch
    // validateStatus: status => status < 500 means 500 itself is NOT covered;
    // use 400 which is a "bad request" scenario
    mockedPost.mockResolvedValue({status: 400});

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const p = facilitator.acknowledge({id: 'bad-id', amount: '1', token: 'T'});
    await jest.runAllTimersAsync();
    await p;

    expect(warnSpy.mock.calls.some(c => String(c[0]).includes('ACK'))).toBe(
      true,
    );
    warnSpy.mockRestore();
  });
});
