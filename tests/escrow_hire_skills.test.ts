/**
 * Unit tests for Escrow Hire Skills (composite: init_job + deposit)
 */

// Mock the dependencies
const mockInitJob = jest.fn();
const mockDeposit = jest.fn();

jest.mock('../src/skills/validation_skills', () => ({
  initJob: (...args: unknown[]) => mockInitJob(...args),
}));

jest.mock('../src/skills/escrow_skills', () => ({
  deposit: (...args: unknown[]) => mockDeposit(...args),
}));

jest.mock('../src/utils/wait_for_tx', () => ({
  requireTxSuccess: jest.fn().mockResolvedValue(undefined),
}));

import {hireWithEscrow} from '../src/skills/escrow_hire_skills';

describe('Escrow Hire Skills', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hireWithEscrow', () => {
    it('should call initJob then deposit', async () => {
      mockInitJob.mockResolvedValueOnce('init-tx-hash');
      mockDeposit.mockResolvedValueOnce('deposit-tx-hash');

      const result = await hireWithEscrow({
        jobId: 'job-1',
        agentNonce: 1,
        agentAddress:
          'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3',
        paymentAmount: 1_000_000_000_000_000_000n,
        poaHash: 'abc123',
        deadlineSeconds: 3600,
      });

      expect(result.initJobTxHash).toBe('init-tx-hash');
      expect(result.depositTxHash).toBe('deposit-tx-hash');
    });

    it('should forward parameters correctly to initJob', async () => {
      mockInitJob.mockResolvedValueOnce('tx1');
      mockDeposit.mockResolvedValueOnce('tx2');

      await hireWithEscrow({
        jobId: 'my-job',
        agentNonce: 5,
        agentAddress:
          'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3',
        paymentAmount: 500n,
        poaHash: 'deadbeef',
        deadlineSeconds: 60,
        serviceId: 2,
      });

      expect(mockInitJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'my-job',
          agentNonce: 5,
          serviceId: 2,
          paymentAmount: 500n,
        }),
      );
    });

    it('should forward parameters correctly to deposit', async () => {
      mockInitJob.mockResolvedValueOnce('tx1');
      mockDeposit.mockResolvedValueOnce('tx2');

      const agentAddr =
        'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3';

      await hireWithEscrow({
        jobId: 'my-job',
        agentNonce: 5,
        agentAddress: agentAddr,
        paymentAmount: 500n,
        poaHash: 'deadbeef',
        deadlineSeconds: 60,
      });

      expect(mockDeposit).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'my-job',
          receiverAddress: agentAddr,
          poaHash: 'deadbeef',
          amount: 500n,
        }),
      );
    });

    it('should propagate initJob error', async () => {
      mockInitJob.mockRejectedValueOnce(new Error('init failed'));

      await expect(
        hireWithEscrow({
          jobId: 'job-1',
          agentNonce: 1,
          agentAddress:
            'erd1qqqqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3',
          paymentAmount: 100n,
          poaHash: 'abc',
          deadlineSeconds: 60,
        }),
      ).rejects.toThrow('init failed');

      expect(mockDeposit).not.toHaveBeenCalled();
    });
  });
});
