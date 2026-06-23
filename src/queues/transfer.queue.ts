import { transferQueue } from './index';

export const addBankTransferJob = async (data: {
  transferId: string;
  fromUserId: string;
  amount: number;
  reference: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
}) => {
  return transferQueue.add('bank-transfer', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  });
};

export const addScheduledTransferJob = async (data: { transferId: string }, delayMs: number) => {
  return transferQueue.add('scheduled-transfer', data, { delay: delayMs });
};