import { v4 as uuidv4 }            from 'uuid';

import redis from "@config/redis";
import { AppError, NotFoundError, ValidationError } from "@core/errors/AppError";
import { paystackService } from "@infrastructure/paystack";
import { User } from "@modules/auth/auth.model";
import { logger } from "@shared/utils/logger";
import { Deposit, IDeposit } from "./deposit.model";
import { walletService } from "../wallet.service";
import { WalletType } from "@core/types/enums";
import { whatsAppService } from "@infrastructure/whatsapp";
import { IWithdrawal, Withdrawal } from "./withdrawal.model";
import { Wallet } from "../wallet.model";

// ── WITHDRAWAL FEE STRUCTURE ──────────────────────────────────────────────────
const getWithdrawalFee = (amount: number): number => {
  if (amount <= 5_000)   return 10;
  if (amount <= 50_000)  return 25;
  if (amount <= 200_000) return 50;
  return 100;
};

export class DepositWithdrawalService {

  // ════════════════════════════════════════════════════════════════════
  //  DEPOSITS
  //  Uses Paystack Dedicated Virtual Account (DVA)
  //  User pays via bank transfer from their own bank app — no links
  //  Webhook fires → wallet credited → WhatsApp notification sent
  // ════════════════════════════════════════════════════════════════════

  // ── CREATE OR GET DEDICATED VIRTUAL ACCOUNT ───────────────────────
  async createOrGetVirtualAccount(userId: string): Promise<{
    bankName:      string;
    accountNumber: string;
    accountName:   string;
  }> {
    // Return from Redis cache if already created
    const cacheKey = `dva:${userId}`;
    const cached   = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    try {
      const dva = await paystackService.createDedicatedVirtualAccount({
        customer:       userId,
        preferred_bank: 'wema-bank',
        firstName:      user.fullName.split(' ')[0],
        lastName:       user.fullName.split(' ').slice(1).join(' ') || user.fullName,
        email:          user.email || `${user.phone}@agrofinpay.ng`,
        phone:          user.phone,
      });

      const result = {
        bankName:      dva.bank.name,
        accountNumber: dva.account_number,
        accountName:   dva.account_name,
      };

      // Cache permanently — DVAs don't change
      await redis.set(cacheKey, JSON.stringify(result));

      logger.info(`[DVA] Created for user=${userId}: ${result.accountNumber}`);
      return result;

    } catch (err: any) {
      logger.error('[DVA] Create failed:', err.message);
      throw new AppError('Could not create virtual account. Please try again.', 500);
    }
  }

  // ── GET DEPOSIT INSTRUCTIONS (WhatsApp message text) ──────────────
  // Everything happens inside WhatsApp — user just transfers to the DVA
  async getDepositInstructions(
    userId:           string,
    requestedAmount?: number
  ): Promise<string> {
    const dva = await this.createOrGetVirtualAccount(userId);

    const amountLine = requestedAmount
      ? `Please transfer exactly *₦${requestedAmount.toLocaleString()}*`
      : `You can transfer *any amount* (minimum ₦100)`;

    return (
      `💰 *Fund Your Wallet*\n\n` +
      `Transfer to this account from any bank app or USSD:\n\n` +
      `🏦 Bank: *${dva.bankName}*\n` +
      `📋 Account: *${dva.accountNumber}*\n` +
      `👤 Name: *${dva.accountName}*\n\n` +
      `${amountLine}\n\n` +
      `⚡ Your wallet will be credited *automatically* within 1 minute.\n` +
      `You'll receive a WhatsApp confirmation once it arrives. ✅\n\n` +
      `_This account is permanent — save it for future deposits._`
    );
  }

  // ── CONFIRM DEPOSIT — called by Paystack DVA webhook ──────────────
  async confirmDeposit(
    reference: string,
    amount:    number,
    userId:    string
  ): Promise<void> {
    // Idempotency lock — prevents double crediting on duplicate webhooks
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

    // Create deposit record
    const deposit = existing || new Deposit({
      userId,
      amount,
      reference,
      channel: 'BANK_TRANSFER',
      status:  'PENDING',
    });

    deposit.status = 'SUCCESS';
    deposit.paidAt = new Date();
    await deposit.save();

    // Credit user's NGN wallet
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

  // ── FAIL DEPOSIT ──────────────────────────────────────────────────
  async failDeposit(reference: string): Promise<void> {
    const deposit = await Deposit.findOne({ reference, status: 'PENDING' });
    if (!deposit) return;

    deposit.status = 'FAILED';
    await deposit.save();

    logger.warn(`[Deposit] Failed: ref=${reference}`);
  }

  // ── GET DEPOSIT BY REFERENCE ──────────────────────────────────────
  async getDepositByReference(reference: string, userId: string): Promise<IDeposit> {
    const deposit = await Deposit.findOne({ reference, userId });
    if (!deposit) throw new NotFoundError('Deposit');
    return deposit;
  }

  // ── GET USER DEPOSITS ─────────────────────────────────────────────
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
  //  WITHDRAWALS
  //  100% WhatsApp — user provides bank details in chat
  //  Bot debits wallet → Paystack Transfer API → bank account
  //  All status updates sent back via WhatsApp
  // ════════════════════════════════════════════════════════════════════

  // ── FIND BANK CODE FROM NAME ──────────────────────────────────────
  async findBankCode(bankName: string): Promise<{ name: string; code: string } | null> {
    const banks = await this.getBanks();
    const lower = bankName.toLowerCase().trim();

    // Try exact match first
    let match = banks.find((b: any) => b.name.toLowerCase() === lower);

    // Try partial match
    if (!match) {
      match = banks.find((b: any) =>
        b.name.toLowerCase().includes(lower) ||
        lower.includes(b.name.toLowerCase().split(' ')[0])
      );
    }

    return match || null;
  }

  // ── RESOLVE BANK ACCOUNT ──────────────────────────────────────────
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
        'Account not found. Please check the account number and bank name.'
      );
    }
  }

  // ── GET BANKS (cached 24 hours) ───────────────────────────────────
  async getBanks(): Promise<{ name: string; code: string }[]> {
    const cacheKey = 'banks:nigeria';
    const cached   = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const banks = await paystackService.getBanks();
    await redis.set(cacheKey, JSON.stringify(banks), 'EX', 86400);
    return banks;
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

    // Validate wallet
    const wallet = await Wallet.findOne({ userId, type: WalletType.NGN });
    if (!wallet)         throw new NotFoundError('NGN Wallet');
    if (wallet.isFrozen) throw new AppError(
      'Your wallet is frozen. Reply *HELP* to contact support.',
      400,
      'WALLET_FROZEN'
    );
    if (wallet.balance < total) throw new AppError(
      `Insufficient balance.\n\n` +
      `Required: ₦${total.toLocaleString()} (₦${data.amount.toLocaleString()} + ₦${fee} fee)\n` +
      `Your balance: ₦${wallet.balance.toLocaleString()}\n\n` +
      `Reply *DEPOSIT* to fund your wallet first.`,
      400,
      'INSUFFICIENT_BALANCE'
    );

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

    // Debit wallet (escrow while processing)
    await walletService.debit(
      userId,
      WalletType.NGN,
      total,
      `Withdrawal to ${data.accountName} — ${data.bankName}`,
      { reference, fee }
    );

    // Initiate Paystack transfer
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
        amount:    data.amount * 100, // Paystack uses kobo
        recipient: recipientCode,
        reason:    data.narration || `AgroFinPay withdrawal — ${reference}`,
        reference,
      });

      withdrawal.gatewayReference = result.transfer_code;
      await withdrawal.save();

      // Notify user
      const user = await User.findById(userId);
      if (user) {
        await whatsAppService.sendText(
          user.phone,
          `⏳ *Withdrawal Processing*\n\n` +
          `Amount: *₦${data.amount.toLocaleString()}*\n` +
          `To: *${data.accountName}* (${data.bankName})\n` +
          `Fee: ₦${fee}\n` +
          `Reference: ${reference}\n\n` +
          `You'll be notified once complete (usually 1–3 minutes). 🏦`
        );
      }

    } catch (err: any) {
      // Paystack failed — reverse the wallet debit immediately
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

      logger.error(`[Withdrawal] Initiation failed, wallet reversed: ref=${reference}`, err.message);
      throw new AppError(
        `Withdrawal could not be processed. Your wallet has been refunded automatically. Reply *HELP* if you need support.`,
        500
      );
    }

    logger.info(`[Withdrawal] Initiated: ref=${reference} amount=${data.amount} user=${userId}`);
    return withdrawal;
  }

  // ── CONFIRM WITHDRAWAL — Paystack transfer.success webhook ────────
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
        `*${withdrawal.accountName}* (${withdrawal.bankName})\n` +
        `Reference: ${reference}\n\n` +
        `Reply *BALANCE* to check your wallet or *MENU* to continue.`
      );
    }

    logger.info(`[Withdrawal] Confirmed: ref=${reference}`);
  }

  // ── FAIL WITHDRAWAL — Paystack transfer.failed/reversed webhook ───
  async failWithdrawal(reference: string, reason: string): Promise<void> {
    const withdrawal = await Withdrawal.findOne({ reference });
    if (!withdrawal || withdrawal.status === 'FAILED') return;

    const refundAmount       = withdrawal.amount + withdrawal.fee;
    withdrawal.status        = 'FAILED';
    withdrawal.failureReason = reason;
    await withdrawal.save();

    // Refund full amount including fee
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
        `Reply *WITHDRAW* to try again or *HELP* for support.`
      );
    }

    logger.warn(`[Withdrawal] Failed and refunded: ref=${reference} reason=${reason}`);
  }

  // ── GET WITHDRAWAL BY REFERENCE ───────────────────────────────────
  async getWithdrawalByReference(reference: string, userId: string): Promise<IWithdrawal> {
    const withdrawal = await Withdrawal.findOne({ reference, userId });
    if (!withdrawal) throw new NotFoundError('Withdrawal');
    return withdrawal;
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
    if (!['SUCCESS', 'PROCESSING'].includes(withdrawal.status)) {
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
        `Your withdrawal of *₦${withdrawal.amount.toLocaleString()}* (Ref: ${reference}) has been reversed.\n` +
        `The full amount has been returned to your wallet.\n\n` +
        `Reply *HELP* if you have any questions.`
      );
    }

    logger.info(`[Withdrawal] Reversed by admin=${adminId}: ref=${reference}`);
  }

  // ── ADMIN: GET ALL DEPOSITS ───────────────────────────────────────
  async getAllDeposits(filters: {
    status?: string;
    userId?: string;
    limit?:  number;
    offset?: number;
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
    status?: string;
    userId?: string;
    limit?:  number;
    offset?: number;
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
    const today     = new Date(); today.setHours(0, 0, 0, 0);
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