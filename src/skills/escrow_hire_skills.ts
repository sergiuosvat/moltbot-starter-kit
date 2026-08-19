/**
 * Escrow hire — orchestrates init_job + escrow deposit
 *
 * Composite skill for on-chain escrow hiring (distinct from the facilitator
 * employer demo and from A2A session negotiation).
 */
import {Logger} from '../utils/logger';
import {requireTxSuccess} from '../utils/wait_for_tx';
import {initJob} from './validation_skills';
import {deposit} from './escrow_skills';

const logger = new Logger('EscrowHireSkills');

export interface HireWithEscrowParams {
  jobId: string;
  agentNonce: number;
  agentAddress: string;
  paymentAmount: bigint;
  poaHash: string;
  deadlineSeconds: number;
  paymentToken?: string;
  serviceId?: number;
}

export interface HireWithEscrowResult {
  initJobTxHash: string;
  depositTxHash: string;
}

export async function hireWithEscrow(
  params: HireWithEscrowParams,
): Promise<HireWithEscrowResult> {
  logger.info(
    `Escrow-hiring agent #${params.agentNonce} for job ${params.jobId}`,
  );

  const initJobTxHash = await initJob({
    jobId: params.jobId,
    agentNonce: params.agentNonce,
    serviceId: params.serviceId,
    paymentAmount: params.paymentAmount,
    paymentToken: params.paymentToken,
  });
  logger.info(`Job initialized: ${initJobTxHash}`);
  await requireTxSuccess(initJobTxHash);

  const deadlineTimestamp =
    Math.floor(Date.now() / 1000) + params.deadlineSeconds;

  const depositTxHash = await deposit({
    jobId: params.jobId,
    receiverAddress: params.agentAddress,
    poaHash: params.poaHash,
    deadlineTimestamp,
    amount: params.paymentAmount,
    token: params.paymentToken,
  });
  logger.info(`Escrow deposited: ${depositTxHash}`);
  await requireTxSuccess(depositTxHash);

  return {initJobTxHash, depositTxHash};
}
