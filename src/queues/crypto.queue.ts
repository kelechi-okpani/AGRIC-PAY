import { cryptoQueue } from './index';

export const addCryptoSwapJob = async (data: {
  transactionId: string;
  userId: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: number;
  toAmount: number;
}) => {
  return cryptoQueue.add('process-swap', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  });
};

export const addCryptoBuyJob = async (data: {
  transactionId: string;
  userId: string;
  asset: string;
  ngnAmount: number;
  cryptoAmount: number;
}) => {
  return cryptoQueue.add('process-buy', data, { attempts: 3 });
};

export const addCryptoSellJob = async (data: {
  transactionId: string;
  userId: string;
  asset: string;
  cryptoAmount: number;
  ngnAmount: number;
}) => {
  return cryptoQueue.add('process-sell', data, { attempts: 3 });
};