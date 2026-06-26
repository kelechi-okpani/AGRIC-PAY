import axios from 'axios';
import { env } from '../config/env';
import { AppError } from '../core/errors/AppError';
import { logger } from '../shared/utils/logger';

const paystackAxios = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
});

class PaystackService {


  // ── CREATE VIRTUAL CARD ───────────────────────────────────────────────
async createVirtualCard(data: {
  currency:            string;
  holder_name:         string;
  billing_address:     string;
  billing_city:        string;
  billing_state:       string;
  billing_postal_code: string;
  billing_country:     string;
}): Promise<{
  id:           string;
  card_pan:     string;
  expiry_month: string;
  expiry_year:  string;
  cvv:          string;
  balance:      number;
  status:       string;
}> {
  try {
    const res = await paystackAxios.post('/virtual-cards', data);
    return res.data.data;
  } catch (err: any) {
    logger.error('[Paystack] Create virtual card failed:', err.response?.data);
    throw new AppError('Virtual card creation failed', 500);
  }
}

// ── FUND VIRTUAL CARD ─────────────────────────────────────────────────
async fundVirtualCard(cardId: string, amountUSD: number): Promise<void> {
  try {
    await paystackAxios.post(`/virtual-cards/${cardId}/fund`, {
      amount:           amountUSD * 100, // Paystack uses cents for USD
      debit_currency:   'NGN',
    });
  } catch (err: any) {
    logger.error('[Paystack] Fund virtual card failed:', err.response?.data);
    throw new AppError('Card funding failed', 500);
  }
}

// ── FREEZE VIRTUAL CARD ───────────────────────────────────────────────
async freezeVirtualCard(cardId: string): Promise<void> {
  try {
    await paystackAxios.put(`/virtual-cards/${cardId}/deactivate`);
  } catch (err: any) {
    logger.error('[Paystack] Freeze virtual card failed:', err.response?.data);
    throw new AppError('Card freeze failed', 500);
  }
}

// ── UNFREEZE VIRTUAL CARD ─────────────────────────────────────────────
async unfreezeVirtualCard(cardId: string): Promise<void> {
  try {
    await paystackAxios.put(`/virtual-cards/${cardId}/activate`);
  } catch (err: any) {
    logger.error('[Paystack] Unfreeze virtual card failed:', err.response?.data);
    throw new AppError('Card unfreeze failed', 500);
  }
}

// ── TERMINATE VIRTUAL CARD ────────────────────────────────────────────
async terminateVirtualCard(cardId: string): Promise<void> {
  try {
    await paystackAxios.post(`/virtual-cards/${cardId}/terminate`);
  } catch (err: any) {
    logger.error('[Paystack] Terminate virtual card failed:', err.response?.data);
    throw new AppError('Card termination failed', 500);
  }
}

// ── GET CARD TRANSACTIONS ─────────────────────────────────────────────
async getVirtualCardTransactions(
  cardId: string,
  from:   string,
  to:     string,
  page:   number = 1,
  limit:  number = 20
): Promise<any[]> {
  try {
    const res = await paystackAxios.get(`/virtual-cards/${cardId}/transactions`, {
      params: { from, to, page, perPage: limit },
    });
    return res.data.data;
  } catch (err: any) {
    logger.error('[Paystack] Get card transactions failed:', err.response?.data);
    throw new AppError('Failed to fetch card transactions', 500);
  }
}

// ── GET VIRTUAL CARD DETAILS ──────────────────────────────────────────
async getVirtualCard(cardId: string): Promise<any> {
  try {
    const res = await paystackAxios.get(`/virtual-cards/${cardId}`);
    return res.data.data;
  } catch (err: any) {
    logger.error('[Paystack] Get virtual card failed:', err.response?.data);
    throw new AppError('Failed to fetch card details', 500);
  }
}

  async createDedicatedVirtualAccount(data: {
  customer:       string;
  preferred_bank: string;
  firstName:      string;
  lastName:       string;
  email:          string;
  phone:          string;
}): Promise<{ account_number: string; account_name: string; bank: { name: string; id: number } }> {
  try {
    // Step 1 — create or fetch Paystack customer
    const customerRes = await paystackAxios.post('/customer', {
      email:      data.email,
      first_name: data.firstName,
      last_name:  data.lastName,
      phone:      data.phone,
      metadata:   { userId: data.customer },
    });

    const customerCode = customerRes.data.data.customer_code;

    // Step 2 — create dedicated virtual account
    const dvaRes = await paystackAxios.post('/dedicated_account', {
      customer:       customerCode,
      preferred_bank: data.preferred_bank, // 'wema-bank' or 'titan-paystack'
    });

    return dvaRes.data.data;
  } catch (err: any) {
    logger.error('[Paystack] Create DVA failed:', err.response?.data);
    throw new AppError('Virtual account creation failed', 500);
  }
}

  async initializeTransaction(data: {
    email: string;
    amount: number;
    reference: string;
    metadata?: Record<string, any>;
  }) {
    try {
      const res = await paystackAxios.post('/transaction/initialize', data);
      return res.data.data;
    } catch (err: any) {
      logger.error('[Paystack] Init transaction failed:', err.response?.data);
      throw new AppError('Payment initialization failed', 500);
    }
  }

  async verifyTransaction(reference: string) {
    try {
      const res = await paystackAxios.get(`/transaction/verify/${reference}`);
      return res.data.data;
    } catch (err: any) {
      logger.error('[Paystack] Verify transaction failed:', err.response?.data);
      throw new AppError('Payment verification failed', 500);
    }
  }

  async createTransferRecipient(data: {
    type: string;
    name: string;
    account_number: string;
    bank_code: string;
    currency: string;
  }): Promise<string> {
    try {
      const res = await paystackAxios.post('/transferrecipient', data);
      return res.data.data.recipient_code;
    } catch (err: any) {
      logger.error('[Paystack] Create recipient failed:', err.response?.data);
      throw new AppError('Failed to create transfer recipient', 500);
    }
  }

  async initiateTransfer(data: {
    source: string;
    amount: number;
    recipient: string;
    reason: string;
    reference: string;
  }) {
    try {
      const res = await paystackAxios.post('/transfer', data);
      return res.data.data;
    } catch (err: any) {
      logger.error('[Paystack] Initiate transfer failed:', err.response?.data);
      throw new AppError('Transfer initiation failed', 500);
    }
  }

  async getBanks() {
    try {
      const res = await paystackAxios.get('/bank?country=nigeria');
      return res.data.data;
    } catch (err: any) {
      throw new AppError('Failed to fetch banks', 500);
    }
  }

  async resolveAccountNumber(accountNumber: string, bankCode: string) {
    try {
      const res = await paystackAxios.get(`/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);
      return res.data.data;
    } catch (err: any) {
      throw new AppError('Account resolution failed. Check account number and bank.', 400);
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    const hash = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(payload).digest('hex');
    return hash === signature;
  }
}

export const paystackService = new PaystackService();