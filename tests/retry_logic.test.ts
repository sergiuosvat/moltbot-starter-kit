import {JobHandler} from '../src/job_handler';
import {Validator} from '../src/validator';
import {JobProcessor} from '../src/processor';

// Mock Timer to speed up tests
jest.useFakeTimers();

describe('JobHandler Retry Logic', () => {
  let validator: Validator;
  let processor: JobProcessor;
  let handler: JobHandler;

  beforeEach(() => {
    validator = new Validator();
    processor = new JobProcessor();
    handler = new JobHandler(validator, processor);

    // Reset Config if needed or ensure mocking handles it
    // We will mock implementation details
  });

  it('should NOT resend transaction if it is pending, but eventually succeeds', async () => {
    const payment = {
      amount: '10',
      token: 'EGLD',
      meta: {jobId: 'job-pending', payload: 'data'},
    };

    jest.spyOn(processor, 'process').mockResolvedValue('hash123');

    const submitSpy = jest
      .spyOn(validator, 'submitProof')
      .mockResolvedValueOnce('txHash1');

    const statusSpy = jest
      .spyOn(validator, 'getTxStatus')
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('success');

    // Run handler
    const handlerPromise = handler.handle('job-pending', payment);

    // Poll 1: pending
    await jest.runOnlyPendingTimersAsync();
    // Poll 2: pending
    await jest.runOnlyPendingTimersAsync();
    // Poll 3: success
    await jest.runOnlyPendingTimersAsync();

    await handlerPromise;

    expect(submitSpy).toHaveBeenCalledTimes(1); // ONLY ONE SUBMISSION
    expect(statusSpy).toHaveBeenCalledTimes(3);
    expect(statusSpy).toHaveBeenCalledWith('txHash1');
  });

  it('should retry broadcasting (recreating tx) if first tx fails', async () => {
    const payment = {
      amount: '10',
      token: 'EGLD',
      meta: {jobId: 'job-failed-retry', payload: 'data'},
    };

    jest.spyOn(processor, 'process').mockResolvedValue('hash123');

    const submitSpy = jest
      .spyOn(validator, 'submitProof')
      .mockResolvedValueOnce('txHash1')
      .mockResolvedValueOnce('txHash2');

    const statusSpy = jest
      .spyOn(validator, 'getTxStatus')
      .mockResolvedValueOnce('fail') // First one fails
      .mockResolvedValueOnce('success'); // Second one succeeds

    const handlerPromise = handler.handle('job-failed-retry', payment);

    // Attempt 1: fails
    await jest.runOnlyPendingTimersAsync();
    // Attempt 2: success
    await jest.runOnlyPendingTimersAsync();

    await handlerPromise;

    expect(submitSpy).toHaveBeenCalledTimes(2);
    expect(statusSpy).toHaveBeenCalledWith('txHash1');
    expect(statusSpy).toHaveBeenCalledWith('txHash2');
  });

  it('should retry processing if it fails', async () => {
    const payment = {
      amount: '10',
      token: 'EGLD',
      meta: {jobId: 'job-process-retry', payload: 'data'},
    };

    jest.spyOn(validator, 'submitProof').mockResolvedValue('txHash');
    jest.spyOn(validator, 'getTxStatus').mockResolvedValue('success');

    const processSpy = jest
      .spyOn(processor, 'process')
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue('hash123');

    const handlerPromise = handler.handle('job-process-retry', payment);

    // Fast-forward processing retry delay (2s)
    await jest.runAllTimersAsync();

    // Fast-forward submission delay
    await jest.runAllTimersAsync();

    await handlerPromise;

    expect(processSpy).toHaveBeenCalledTimes(2);
  });
});
