import axios from 'axios';
import { env } from '../config/env';
import { AppError } from '../core/errors/AppError';
import { logger } from '../shared/utils/logger';

const monoAxios = axios.create({
  baseURL: 'https://api.withmono.com/v2',
  headers: { 'mono-sec-key': env.MONO_SECRET_KEY, 'Content-Type': 'application/json' },
});

class MonoService {

  async exchangeToken(code: string): Promise<{ id: string }> {
    try {
      const res = await monoAxios.post('/accounts/auth', { code });
      return res.data.data;
    } catch (err: any) {
      logger.error('[Mono] Token exchange failed:', err.response?.data);
      throw new AppError('Bank account linking failed', 500);
    }
  }

  async getAccountDetails(accountId: string) {
    try {
      const res = await monoAxios.get(`/accounts/${accountId}`);
      return res.data.data;
    } catch (err: any) {
      logger.error('[Mono] Get account failed:', err.response?.data);
      throw new AppError('Failed to retrieve account details', 500);
    }
  }

  async getAccountBalance(accountId: string) {
    try {
      const res = await monoAxios.get(`/accounts/${accountId}/balance`);
      return res.data.data;
    } catch (err: any) {
      throw new AppError('Failed to fetch balance', 500);
    }
  }

  async getTransactions(accountId: string, options: {
    start?: string;
    end?: string;
    narration?: string;
    limit?: number;
    paginate?: boolean;
  }) {
    try {
      const res = await monoAxios.get(`/accounts/${accountId}/transactions`, { params: options });
      return res.data.data;
    } catch (err: any) {
      throw new AppError('Failed to fetch transactions', 500);
    }
  }

  async getIncome(accountId: string) {
    try {
      const res = await monoAxios.get(`/accounts/${accountId}/income`);
      return res.data.data;
    } catch (err: any) {
      throw new AppError('Failed to fetch income data', 500);
    }
  }

  async lookupBVN(bvn: string) {
    try {
      const res = await monoAxios.post('/lookup/bvn/initiate', { bvn });
      return res.data.data;
    } catch (err: any) {
      logger.error('[Mono] BVN lookup failed:', err.response?.data);
      throw new AppError('BVN lookup failed', 500);
    }
  }

  async verifyBVNOTP(session_id: string, otp: string) {
    try {
      const res = await monoAxios.post('/lookup/bvn/verify', { session_id, otp });
      return res.data.data;
    } catch (err: any) {
      throw new AppError('BVN OTP verification failed', 500);
    }
  }
}

export const monoService = new MonoService();