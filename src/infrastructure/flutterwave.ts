import axios from 'axios';
import { env } from '../config/env';
import { AppError } from '../core/errors/AppError';
import { logger } from '../shared/utils/logger';

const flwAxios = axios.create({
  baseURL: 'https://api.flutterwave.com/v3',
  headers: { Authorization: `Bearer ${env.FLUTTERWAVE_SECRET_KEY}` },
});

class FlutterwaveService {

  async initiateTransfer(data: {
    account_bank: string;
    account_number: string;
    amount: number;
    narration: string;
    currency: string;
    reference: string;
    beneficiary_name: string;
  }) {
    try {
      const res = await flwAxios.post('/transfers', data);
      return res.data.data;
    } catch (err: any) {
      logger.error('[Flutterwave] Transfer failed:', err.response?.data);
      throw new AppError('Flutterwave transfer failed', 500);
    }
  }

  async verifyTransfer(id: string) {
    try {
      const res = await flwAxios.get(`/transfers/${id}`);
      return res.data.data;
    } catch (err: any) {
      logger.error('[Flutterwave] Verify transfer failed:', err.response?.data);
      throw new AppError('Transfer verification failed', 500);
    }
  }

  async initializePayment(data: {
    tx_ref: string;
    amount: number;
    currency: string;
    redirect_url: string;
    customer: { email: string; phone_number: string; name: string };
    meta?: Record<string, any>;
  }) {
    try {
      const res = await flwAxios.post('/payments', data);
      return res.data.data;
    } catch (err: any) {
      logger.error('[Flutterwave] Payment init failed:', err.response?.data);
      throw new AppError('Payment initialization failed', 500);
    }
  }

  async verifyPayment(transactionId: string) {
    try {
      const res = await flwAxios.get(`/transactions/${transactionId}/verify`);
      return res.data.data;
    } catch (err: any) {
      logger.error('[Flutterwave] Payment verify failed:', err.response?.data);
      throw new AppError('Payment verification failed', 500);
    }
  }

  async getBanks(country: string = 'NG') {
    try {
      const res = await flwAxios.get(`/banks/${country}`);
      return res.data.data;
    } catch (err: any) {
      throw new AppError('Failed to fetch banks', 500);
    }
  }

  async createVirtualCard(data: {
    currency: string;
    amount: number;
    billing_name: string;
    billing_address: string;
    billing_city: string;
    billing_state: string;
    billing_postal_code: string;
    billing_country: string;
  }) {
    try {
      const res = await flwAxios.post('/virtual-cards', data);
      return res.data.data;
    } catch (err: any) {
      logger.error('[Flutterwave] Create virtual card failed:', err.response?.data);
      throw new AppError('Virtual card creation failed', 500);
    }
  }

  async fundVirtualCard(cardId: string, amount: number) {
    try {
      const res = await flwAxios.post(`/virtual-cards/${cardId}/fund`, { amount, debit_currency: 'NGN' });
      return res.data.data;
    } catch (err: any) {
      logger.error('[Flutterwave] Fund card failed:', err.response?.data);
      throw new AppError('Card funding failed', 500);
    }
  }

  async freezeVirtualCard(cardId: string) {
    try {
      const res = await flwAxios.put(`/virtual-cards/${cardId}/status/block`);
      return res.data.data;
    } catch (err: any) {
      throw new AppError('Card freeze failed', 500);
    }
  }

  async unfreezeVirtualCard(cardId: string) {
    try {
      const res = await flwAxios.put(`/virtual-cards/${cardId}/status/unblock`);
      return res.data.data;
    } catch (err: any) {
      throw new AppError('Card unfreeze failed', 500);
    }
  }

  async terminateVirtualCard(cardId: string) {
    try {
      const res = await flwAxios.put(`/virtual-cards/${cardId}/terminate`);
      return res.data.data;
    } catch (err: any) {
      throw new AppError('Card termination failed', 500);
    }
  }

  async getVirtualCardTransactions(cardId: string, from: string, to: string, index: number, size: number) {
    try {
      const res = await flwAxios.get(`/virtual-cards/${cardId}/transactions`, {
        params: { from, to, index, size },
      });
      return res.data.data;
    } catch (err: any) {
      throw new AppError('Failed to fetch card transactions', 500);
    }
  }

  verifyWebhookSignature(signature: string, secretHash: string): boolean {
    return signature === secretHash;
  }
}

export const flutterwaveService = new FlutterwaveService();