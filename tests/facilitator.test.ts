import {Facilitator} from '../src/facilitator';
import axios from 'axios';

jest.mock('axios');
jest.useFakeTimers();

describe('Facilitator', () => {
  let facilitator: Facilitator;
  const mockEvents = [
    {
      id: 'evt-1',
      amount: '1000000',
      token: 'USDC-123456',
      meta: {jobId: 'job-abc', payload: 'http://data'},
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.get as jest.Mock).mockResolvedValue({data: mockEvents});
    facilitator = new Facilitator('http://mock-facilitator.com');
  });

  afterEach(async () => {
    await facilitator.stop();
  });

  test('should poll events and trigger callback', async () => {
    const callback = jest.fn();
    facilitator.onPayment(callback);

    void facilitator.start();

    // Fast-forward time to trigger interval
    jest.advanceTimersByTime(5100);

    // Allow any pending promises to resolve
    await Promise.resolve();
    await Promise.resolve();

    // Expect axios to have been called with unread=true (with or without options)
    expect(axios.get).toHaveBeenCalledWith(
      'http://mock-facilitator.com/events?unread=true',
      expect.anything(),
    );

    // Expect callback to be called with parsed event
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '1000000',
        token: 'USDC-123456',
        meta: expect.objectContaining({jobId: 'job-abc'}),
      }),
    );
  });

  test('should synchronously emit payment to subscribers', async () => {
    const callback = jest.fn().mockResolvedValue(undefined);
    facilitator.onPayment(callback);

    facilitator.emit({
      amount: '42',
      token: 'EGLD',
      meta: {jobId: 'job-local'},
    });
    await Promise.resolve();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '42',
        token: 'EGLD',
        meta: expect.objectContaining({jobId: 'job-local'}),
      }),
    );
  });

  test('should call prepare endpoint', async () => {
    (axios.post as jest.Mock).mockResolvedValue({data: {ok: true}});

    const result = await facilitator.prepare({
      agentNonce: 1,
      serviceId: 'service-1',
      employerAddress: 'erd1employer',
      jobId: 'job-1',
    });

    expect(axios.post).toHaveBeenCalledWith(
      'http://mock-facilitator.com/prepare',
      expect.objectContaining({
        agentNonce: 1,
        serviceId: 'service-1',
        employerAddress: 'erd1employer',
        jobId: 'job-1',
      }),
    );
    expect(result).toEqual({ok: true});
  });

  test('should call settle endpoint with exact scheme payload', async () => {
    (axios.post as jest.Mock).mockResolvedValue({data: {txHash: 'abc'}});

    const result = await facilitator.settle({
      receiver: 'erd1receiver',
      value: '1000000000000000000',
      jobId: 'job-1',
    });

    expect(axios.post).toHaveBeenCalledWith(
      'http://mock-facilitator.com/settle',
      expect.objectContaining({
        scheme: 'exact',
        payload: expect.objectContaining({
          receiver: 'erd1receiver',
          value: '1000000000000000000',
          jobId: 'job-1',
        }),
        requirements: expect.objectContaining({
          payTo: 'erd1receiver',
          amount: '1000000000000000000',
          asset: 'EGLD',
        }),
      }),
    );
    expect(result).toEqual({txHash: 'abc'});
  });

  test('verifyPayment requires jobId and proof', async () => {
    await expect(
      facilitator.verifyPayment({amount: '1', token: 'EGLD'}),
    ).rejects.toThrow('missing meta.jobId');

    await expect(
      facilitator.verifyPayment({
        amount: '1',
        token: 'EGLD',
        meta: {jobId: 'job-1'},
      }),
    ).rejects.toThrow('missing proof');
  });

  test('verifyPayment accepts settled facilitator lookup', async () => {
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: {status: 'settled'},
    });

    const jobId = await facilitator.verifyPayment({
      amount: '1',
      token: 'EGLD',
      txHash: '0xabc',
      meta: {jobId: 'job-verified'},
    });

    expect(jobId).toBe('job-verified');
    expect(axios.get).toHaveBeenCalledWith(
      'http://mock-facilitator.com/payments/0xabc',
      expect.any(Object),
    );
  });

  test('verifyPayment rejects missing settlement status on 200', async () => {
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: {},
    });

    await expect(
      facilitator.verifyPayment({
        amount: '1',
        token: 'EGLD',
        txHash: '0xabc',
        meta: {jobId: 'job-no-status'},
      }),
    ).rejects.toThrow('missing settlement status');
  });

  test('verifyPayment rejects 404 even when event claims settled', async () => {
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 404,
      data: {},
    });

    await expect(
      facilitator.verifyPayment({
        amount: '1',
        token: 'EGLD',
        status: 'settled',
        txHash: '0xabc',
        meta: {jobId: 'job-404'},
      }),
    ).rejects.toThrow('Cannot verify payment with facilitator');
  });

  test('verifyPayment rejects amount mismatch vs facilitator', async () => {
    (axios.get as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: {status: 'settled', amount: '999', token: 'EGLD'},
    });

    await expect(
      facilitator.verifyPayment({
        amount: '1',
        token: 'EGLD',
        txHash: '0xabc',
        meta: {jobId: 'job-mismatch'},
      }),
    ).rejects.toThrow('amount mismatch');
  });

  test('acknowledge posts event ack', async () => {
    (axios.post as jest.Mock).mockResolvedValueOnce({status: 200, data: {}});

    await facilitator.acknowledge({
      id: 'evt-9',
      amount: '1',
      token: 'EGLD',
      meta: {jobId: 'job-1'},
    });

    expect(axios.post).toHaveBeenCalledWith(
      'http://mock-facilitator.com/events/evt-9/ack',
      {},
      expect.any(Object),
    );
  });

  test('should back off polling delay after consecutive failures', async () => {
    const timerSpy = jest.spyOn(global, 'setTimeout');
    (axios.get as jest.Mock).mockRejectedValue(new Error('network down'));

    void facilitator.start();
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    await Promise.resolve();

    const delays = timerSpy.mock.calls
      .map(call => call[1])
      .filter((value): value is number => typeof value === 'number');

    // First schedule is base delay from start().
    expect(delays[0]).toBe(5000);
    // Next schedule after failure should be 10s + jitter [0, 999].
    expect(delays[1]).toBeGreaterThanOrEqual(10000);
    expect(delays[1]).toBeLessThan(11000);
  });
});
