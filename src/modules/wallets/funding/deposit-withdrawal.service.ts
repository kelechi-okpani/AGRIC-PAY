import redis from '@config/redis';
import { AppError, NotFoundError, ValidationError } from '@core/errors/AppError';
import { paystackService } from '@infrastructure/paystack';
import { User } from '@modules/auth/auth.model';
import { logger } from '@shared/utils/logger';
import { v4 as uuidv4 }            from 'uuid';
import { Deposit } from './deposit.model';
import { walletService } from '../wallet.service';
import { WalletType } from '@core/types/enums';
import { whatsAppService } from '@infrastructure/whatsapp';
import { IWithdrawal, Withdrawal } from './withdrawal.model';
import { Wallet } from '../wallet.model';


// import { Deposit, IDeposit }       from './deposit.model';
// import { Withdrawal, IWithdrawal } from './withdrawal.model';
// import { Wallet }                  from './wallet.model';
// import { walletService }           from './wallet.service';
// import { paystackService }         from '../../infrastructure/paystack';
// import { whatsAppService }         from '../../infrastructure/whatsapp';
// import { User }                    from '../auth/auth.model';
// import { WalletType }              from '../../core/types/enums';
// import {
//   AppError,
//   NotFoundError,
//   ValidationError,
// } from '../../core/errors/AppError';
// import { logger } from '../../shared/utils/logger';
// import redis      from '../../config/redis';

// ── FEE STRUCTURE ─────────────────────────────────────────────────────────────
const getWithdrawalFee = (amount: number): number => {
  if (amount <= 5_000)   return 10;
  if (amount <= 50_000)  return 25;
  if (amount <= 200_000) return 50;
  return 100;
};

export class DepositWithdrawalService {

  // ════════════════════════════════════════════════════════════════════
  //  DEPOSITS — 100% WhatsApp, no external links
  //  Method: Paystack Dedicated Virtual Account (DVA)
  //  User pays via bank transfer from their own banking app
  //  Webhook fires → wallet credited → WhatsApp notification sent
  // ════════════════════════════════════════════════════════════════════

  // ── CREATE DEDICATED VIRTUAL ACCOUNT FOR USER ─────────────────────
  // Called once during user registration or first deposit attempt.
  // Each user gets a permanent virtual account number they can always
  // pay into from any bank app or USSD.
  async createOrGetVirtualAccount(userId: string): Promise<{
    bankName:      string;
    accountNumber: string;
    accountName:   string;
  }> {
    const cacheKey = `dva:${userId}`;
    const cached   = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    try {
      // Create a dedicated virtual account on Paystack
      const result = await paystackService.createDedicatedVirtualAccount({
        customer:       userId,
        preferred_bank: 'wema-bank',
        firstName:      user.fullName.split(' ')[0],
        lastName:       user.fullName.split(' ').slice(1).join(' ') || user.fullName,
        email:          user.email || `${user.phone}@agrofinpay.ng`,
        phone:          user.phone,
      });

      const dva = {
        bankName:      result.bank.name,
        accountNumber: result.account_number,
        accountName:   result.account_name,
      };

      // Cache permanently (DVAs don't change)
      await redis.set(cacheKey, JSON.stringify(dva));
      return dva;

    } catch (err: any) {
      logger.error('[DVA] Create virtual account failed:', err.message);
      throw new AppError('Could not create virtual account. Please try again.', 500);
    }
  }

  // ── SHOW DEPOSIT DETAILS TO USER (WhatsApp message) ───────────────
  // This is what the bot sends when user says DEPOSIT.
  // The user simply transfers money from their bank — no link needed.
  async getDepositInstructions(userId: string, requestedAmount?: number): Promise<string> {
    const dva = await this.createOrGetVirtualAccount(userId);

    const amountLine = requestedAmount
      ? `\nPlease transfer exactly *₦${requestedAmount.toLocaleString()}*`
      : `\nYou can transfer *any amount* (minimum ₦100)`;

    return (
      `💰 *Fund Your Wallet*\n\n` +
      `Transfer money to this account from any bank app or USSD:\n\n` +
      `🏦 Bank: *${dva.bankName}*\n` +
      `📋 Account Number: *${dva.accountNumber}*\n` +
      `👤 Account Name: *${dva.accountName}*\n` +
      `${amountLine}\n\n` +
      `⚡ Your AgroFinPay wallet will be credited *automatically* within 1 minute after payment.\n\n` +
      `You'll receive a confirmation here on WhatsApp. ✅\n\n` +
      `_This account is unique to you. You can save it for future deposits._`
    );
  }

  // ── CONFIRM DEPOSIT — called by Paystack DVA webhook ──────────────
  async confirmDeposit(reference: string, amount: number, userId: string): Promise<void> {
    // Idempotency — prevent double crediting
    const lockKey = `deposit:lock:${reference}`;
    const locked  = await redis.set(lockKey, '1', 'EX', 300, 'NX');
    if (!locked) {
      logger.warn(`[Deposit] Duplicate webhook ignored: ${reference}`);
      return;
    }

    // Check if already processed
    const existing = await Deposit.findOne({ reference });
    if (existing?.status === 'SUCCESS') {
      logger.warn(`[Deposit] Already confirmed: ${reference}`);
      return;
    }

    // Create or update deposit record
    const deposit = existing || await Deposit.create({
      userId,
      amount,
      reference,
      channel: 'BANK_TRANSFER',
      status:  'PENDING',
    });

    deposit.status = 'SUCCESS';
    deposit.paidAt = new Date();
    await deposit.save();

    // Credit user wallet
    await walletService.credit(
      userId,
      WalletType.NGN,
      amount,
      `Wallet deposit via bank transfer`,
      { reference }
    );

    // Notify user on WhatsApp
    const user = await User.findById(userId);
    if (user) {
      await whatsAppService.sendText(
        user.phone,
        `✅ *Deposit Confirmed!*\n\n` +
        `*₦${amount.toLocaleString()}* has been added to your NGN wallet.\n` +
        `Reference: ${reference}\n\n` +
        `Reply *BALANCE* to check your wallet or *MENU* to continue.`
      );
    }

    logger.info(`[Deposit] Confirmed: ref=${reference} amount=${amount} user=${userId}`);
  }

  // ── GET USER DEPOSIT HISTORY ──────────────────────────────────────
  async getUserDeposits(
    userId:  string,
    filters: { status?: string; limit?: number; offset?: number }
  ) {
    const query: any = { userId };
    if (filters.status) query.status = filters.status;

    const [deposits, total] = await Promise.all([
      Deposit.find(query)
        .sort({ createdAt: -1 })
        .skip(filters.offset || 0)
        .limit(filters.limit || 20),
      Deposit.countDocuments(query),
    ]);

    return { deposits, total };
  }

  // ════════════════════════════════════════════════════════════════════
  //  WITHDRAWALS — 100% WhatsApp
  //  User provides bank details in chat
  //  Bot debits wallet and sends to bank via Paystack Transfer API
  //  Status updates sent via WhatsApp
  // ════════════════════════════════════════════════════════════════════

  // ── RESOLVE BANK ACCOUNT — called mid-conversation ─────────────────
  // User provides account number + bank name in WhatsApp chat.
  // We verify with Paystack and return the actual account name.
  async resolveBankAccount(
    accountNumber: string,
    bankCode:      string
  ): Promise<{ accountName: string; accountNumber: string; bankCode: string }> {
    try {
      const result = await paystackService.resolveAccountNumber(accountNumber, bankCode);
      return {
        accountName:   result.account_name,
        accountNumber: result.account_number,
        bankCode,
      };
    } catch {
      throw new ValidationError(
        'Account number not found. Please check the number and bank name and try again.'
      );
    }
  }

  // ── GET BANKS (cached) ────────────────────────────────────────────
  async getBanks(): Promise<{ name: string; code: string }[]> {
    const cacheKey = 'banks:nigeria';
    const cached   = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const banks = await paystackService.getBanks();
    await redis.set(cacheKey, JSON.stringify(banks), 'EX', 86400);
    return banks;
  }

  // ── FIND BANK CODE FROM NAME ──────────────────────────────────────
  async findBankCode(bankName: string): Promise<{ name: string; code: string } | null> {
    const banks = await this.getBanks();
    const lower = bankName.toLowerCase().trim();

    // Exact match first
    let bank = banks.find((b: any) => b.name.toLowerCase() === lower);

    // Partial match fallback
    if (!bank) {
      bank = banks.find((b: any) => b.name.toLowerCase().includes(lower) || lower.includes(b.name.toLowerCase().split(' ')[0]));
    }

    return bank || null;
  }

  // ── INITIATE WITHDRAWAL ───────────────────────────────────────────
  async initiateWithdrawal(
    userId: string,
    data: {
      amount:        number;
      bankCode:      string;
      bankName:      string;
      accountNumber: string;
      accountName:   string;
      narration?:    string;
    }
  ): Promise<IWithdrawal> {
    if (data.amount < 100) throw new ValidationError('Minimum withdrawal is ₦100');

    const fee       = getWithdrawalFee(data.amount);
    const total     = data.amount + fee;
    const reference = `WDR-${uuidv4()}`;

    // Check balance and wallet status
    const wallet = await Wallet.findOne({ userId, type: WalletType.NGN });
    if (!wallet)            throw new NotFoundError('NGN Wallet');
    if (wallet.isFrozen)    throw new AppError('Your wallet is frozen. Contact support by replying HELP.', 400, 'WALLET_FROZEN');
    if (wallet.balance < total) {
      throw new AppError(
        `Insufficient balance.\n\nRequired: ₦${total.toLocaleString()} (₦${data.amount.toLocaleString()} + ₦${fee} fee)\nYour balance: ₦${wallet.balance.toLocaleString()}\n\nReply *DEPOSIT* to fund your wallet.`,
        400,
        'INSUFFICIENT_BALANCE'
      );
    }

    // Create withdrawal record
    const withdrawal = await Withdrawal.create({
      userId,
      amount:        data.amount,
      fee,
      netAmount:     data.amount,
      reference,
      bankCode:      data.bankCode,
      bankName:      data.bankName,
      accountNumber: data.accountNumber,
      accountName:   data.accountName,
      narration:     data.narration || 'AgroFinPay withdrawal',
      status:        'PENDING',
    });

    // Debit wallet immediately (escrow)
    await walletService.debit(
      userId,
      WalletType.NGN,
      total,
      `Withdrawal to ${data.accountName} — ${data.bankName}`,
      { reference, fee }
    );

    // Initiate bank transfer via Paystack
    try {
      withdrawal.status = 'PROCESSING';
      await withdrawal.save();

      const recipientCode = await paystackService.createTransferRecipient({
        type:           'nuban',
        name:           data.accountName,
        account_number: data.accountNumber,
        bank_code:      data.bankCode,
        currency:       'NGN',
      });

      const result = await paystackService.initiateTransfer({
        source:    'balance',
        amount:    data.amount * 100,
        recipient: recipientCode,
        reason:    data.narration || `AgroFinPay withdrawal — ${reference}`,
        reference,
      });

      withdrawal.gatewayReference = result.transfer_code;
      await withdrawal.save();

      // Notify user on WhatsApp
      const user = await User.findById(userId);
      if (user) {
        await whatsAppService.sendText(
          user.phone,
          `⏳ *Withdrawal Processing*\n\n` +
          `Amount: *₦${data.amount.toLocaleString()}*\n` +
          `To: *${data.accountName}* (${data.bankName})\n` +
          `Fee: ₦${fee}\n` +
          `Reference: ${reference}\n\n` +
          `You'll receive confirmation here shortly (usually 1–3 minutes). 🏦`
        );
      }

    } catch (err: any) {
      // Payout failed — reverse the wallet debit
      withdrawal.status        = 'FAILED';
      withdrawal.failureReason = err.message;
      await withdrawal.save();

      await walletService.credit(
        userId,
        WalletType.NGN,
        total,
        `Withdrawal reversal — ${reference}`,
        { reference, reason: 'payout_initiation_failed' }
      );

      logger.error(`[Withdrawal] Initiation failed, wallet reversed: ref=${reference}`);
      throw new AppError(
        `Withdrawal could not be processed. Your wallet has been refunded. Reply *HELP* if you need support.`,
        500
      );
    }

    return withdrawal;
  }

  // ── CONFIRM WITHDRAWAL — Paystack webhook ─────────────────────────
  async confirmWithdrawal(reference: string, gatewayRef?: string): Promise<void> {
    const withdrawal = await Withdrawal.findOne({ reference });
    if (!withdrawal || withdrawal.status === 'SUCCESS') return;

    withdrawal.status           = 'SUCCESS';
    withdrawal.gatewayReference = gatewayRef || withdrawal.gatewayReference;
    withdrawal.processedAt      = new Date();
    await withdrawal.save();

    const user = await User.findById(withdrawal.userId);
    if (user) {
      await whatsAppService.sendText(
        user.phone,
        `✅ *Withdrawal Successful!*\n\n` +
        `*₦${withdrawal.amount.toLocaleString()}* has been sent to:\n` +
        `${withdrawal.accountName} (${withdrawal.bankName})\n` +
        `Reference: ${reference}\n\n` +
        `Reply *BALANCE* to check your wallet or *MENU* to continue.`
      );
    }

    logger.info(`[Withdrawal] Confirmed: ref=${reference}`);
  }

  // ── FAIL WITHDRAWAL — Paystack webhook ────────────────────────────
  async failWithdrawal(reference: string, reason: string): Promise<void> {
    const withdrawal = await Withdrawal.findOne({ reference });
    if (!withdrawal || withdrawal.status === 'FAILED') return;

    const refundAmount   = withdrawal.amount + withdrawal.fee;
    withdrawal.status        = 'FAILED';
    withdrawal.failureReason = reason;
    await withdrawal.save();

    // Refund wallet
    await walletService.credit(
      withdrawal.userId.toString(),
      WalletType.NGN,
      refundAmount,
      `Withdrawal refund — ${reference}`,
      { reference, reason }
    );

    const user = await User.findById(withdrawal.userId);
    if (user) {
      await whatsAppService.sendText(
        user.phone,
        `❌ *Withdrawal Failed*\n\n` +
        `Your withdrawal of *₦${withdrawal.amount.toLocaleString()}* could not be completed.\n` +
        `Reason: ${reason}\n\n` +
        `*₦${refundAmount.toLocaleString()}* (including fee) has been returned to your wallet.\n\n` +
        `Reply *HELP* if you need support or *WITHDRAW* to try again.`
      );
    }

    logger.warn(`[Withdrawal] Failed and refunded: ref=${reference}`);
  }

  // ── GET USER WITHDRAWALS ──────────────────────────────────────────
  async getUserWithdrawals(
    userId:  string,
    filters: { status?: string; limit?: number; offset?: number }
  ) {
    const query: any = { userId };
    if (filters.status) query.status = filters.status;

    const [withdrawals, total] = await Promise.all([
      Withdrawal.find(query)
        .sort({ createdAt: -1 })
        .skip(filters.offset || 0)
        .limit(filters.limit || 20),
      Withdrawal.countDocuments(query),
    ]);

    return { withdrawals, total };
  }

  // ── ADMIN: REVERSE WITHDRAWAL ─────────────────────────────────────
  async reverseWithdrawal(reference: string, adminId: string): Promise<void> {
    const withdrawal = await Withdrawal.findOne({ reference });
    if (!withdrawal) throw new NotFoundError('Withdrawal');
    if (!['SUCCESS','PROCESSING'].includes(withdrawal.status)) {
      throw new ValidationError('Only successful or processing withdrawals can be reversed');
    }

    withdrawal.status = 'REVERSED';
    await withdrawal.save();

    await walletService.credit(
      withdrawal.userId.toString(),
      WalletType.NGN,
      withdrawal.amount + withdrawal.fee,
      `Withdrawal reversed by admin — ${reference}`,
      { reference, reversedBy: adminId }
    );

    const user = await User.findById(withdrawal.userId);
    if (user) {
      await whatsAppService.sendText(
        user.phone,
        `🔄 *Withdrawal Reversed*\n\n` +
        `Your withdrawal of *₦${withdrawal.amount.toLocaleString()}* (Ref: ${reference}) has been reversed by our team.\n` +
        `The full amount has been returned to your wallet.\n\n` +
        `Reply *HELP* if you have questions.`
      );
    }
  }

  // ── ADMIN: GET ALL DEPOSITS ───────────────────────────────────────
  async getAllDeposits(filters: {
    status?: string; userId?: string; limit?: number; offset?: number;
  }) {
    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.userId) query.userId = filters.userId;

    const [deposits, total] = await Promise.all([
      Deposit.find(query)
        .populate('userId', 'fullName phone')
        .sort({ createdAt: -1 })
        .skip(filters.offset || 0)
        .limit(filters.limit || 20),
      Deposit.countDocuments(query),
    ]);

    return { deposits, total };
  }

  // ── ADMIN: GET ALL WITHDRAWALS ────────────────────────────────────
  async getAllWithdrawals(filters: {
    status?: string; userId?: string; limit?: number; offset?: number;
  }) {
    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.userId) query.userId = filters.userId;

    const [withdrawals, total] = await Promise.all([
      Withdrawal.find(query)
        .populate('userId', 'fullName phone')
        .sort({ createdAt: -1 })
        .skip(filters.offset || 0)
        .limit(filters.limit || 20),
      Withdrawal.countDocuments(query),
    ]);

    return { withdrawals, total };
  }

  // ── ADMIN: DEPOSIT STATS ──────────────────────────────────────────
  async getDepositStats() {
    const today     = new Date(); today.setHours(0,0,0,0);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [daily, monthly] = await Promise.all([
      Deposit.aggregate([
        { $match: { status: 'SUCCESS', createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Deposit.aggregate([
        { $match: { status: 'SUCCESS', createdAt: { $gte: thisMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    return {
      daily:   { total: daily[0]?.total   || 0, count: daily[0]?.count   || 0 },
      monthly: { total: monthly[0]?.total || 0, count: monthly[0]?.count || 0 },
    };
  }
}

export const depositWithdrawalService = new DepositWithdrawalService();