import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Wallet, IWallet } from './wallet.model';
import { WalletType, TransactionType } from '../../core/types/enums';
import { AppError, NotFoundError, ValidationError } from '../../core/errors/AppError';
import { paystackService } from '../../infrastructure/paystack';
import { eventBus, Events } from '../../events/EventBus';
import { notificationQueue } from '../../queues';
import { logger } from '../../shared/utils/logger';
import redis from '../../config/redis';

const CURRENCY_MAP: Record<WalletType, string> = {
  [WalletType.NGN]: 'NGN',
  [WalletType.USD]: 'USD',
  [WalletType.CRYPTO]: 'CRYPTO',
};

export class WalletService {

  // ── CREATE WALLETS FOR NEW USER ───────────────────────────
  async createUserWallets(userId: string): Promise<IWallet[]> {
    const wallets = await Promise.all(
      Object.values(WalletType).map((type) =>
        Wallet.create({
          userId,
          type,
          currency: CURRENCY_MAP[type],
          balance: 0,
          ledgerBalance: 0,
        })
      )
    );
    logger.info(`[Wallet] Created wallets for user ${userId}`);
    return wallets;
  }

  // ── GET WALLET ────────────────────────────────────────────
  async getWallet(userId: string, type: WalletType): Promise<IWallet> {
    const wallet = await Wallet.findOne({ userId, type });
    if (!wallet) throw new NotFoundError(`${type} Wallet`);
    return wallet;
  }

  // ── GET ALL WALLETS ───────────────────────────────────────
  async getUserWallets(userId: string): Promise<IWallet[]> {
    return Wallet.find({ userId });
  }

  // ── GET BALANCE ───────────────────────────────────────────
  async getBalance(userId: string, type: WalletType): Promise<{ balance: number; currency: string; isFrozen: boolean }> {
    const cacheKey = `wallet:balance:${userId}:${type}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const wallet = await this.getWallet(userId, type);
    const result = { balance: wallet.balance, currency: wallet.currency, isFrozen: wallet.isFrozen };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);
    return result;
  }

  // ── CREDIT WALLET ─────────────────────────────────────────
  async credit(
    userId: string,
    type: WalletType,
    amount: number,
    description: string,
    metadata?: Record<string, any>
  ): Promise<IWallet> {
    if (amount <= 0) throw new ValidationError('Amount must be greater than zero');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ userId, type }).session(session);
      if (!wallet) throw new NotFoundError(`${type} Wallet`);
      if (!wallet.isActive) throw new AppError('Wallet is inactive', 400);
      if (wallet.isFrozen) throw new AppError('Wallet is frozen', 400, 'WALLET_FROZEN');

      const balanceBefore = wallet.balance;
      wallet.balance += amount;
      wallet.ledgerBalance += amount;

      wallet.transactions.push({
        _id: new mongoose.Types.ObjectId().toString(),
        type: TransactionType.CREDIT,
        amount,
        balanceBefore,
        balanceAfter: wallet.balance,
        reference: uuidv4(),
        description,
        metadata,
        createdAt: new Date(),
      });

      await wallet.save({ session });
      await session.commitTransaction();

      // Invalidate cache
      await redis.del(`wallet:balance:${userId}:${type}`);

      eventBus.emit(Events.WALLET_FUNDED, { userId, type, amount, balance: wallet.balance });

      await notificationQueue.add('wallet-credit', {
        userId,
        channel: 'WHATSAPP',
        message: `✅ Your ${type} wallet has been credited with ${wallet.currency} ${amount.toLocaleString()}. New balance: ${wallet.currency} ${wallet.balance.toLocaleString()}.`,
      });

      return wallet;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ── DEBIT WALLET ──────────────────────────────────────────
  async debit(
    userId: string,
    type: WalletType,
    amount: number,
    description: string,
    metadata?: Record<string, any>
  ): Promise<IWallet> {
    if (amount <= 0) throw new ValidationError('Amount must be greater than zero');

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const wallet = await Wallet.findOne({ userId, type }).session(session);
      if (!wallet) throw new NotFoundError(`${type} Wallet`);
      if (!wallet.isActive) throw new AppError('Wallet is inactive', 400);
      if (wallet.isFrozen) throw new AppError('Wallet is frozen', 400, 'WALLET_FROZEN');
      if (wallet.balance < amount) throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');

      const balanceBefore = wallet.balance;
      wallet.balance -= amount;
      wallet.ledgerBalance -= amount;

      wallet.transactions.push({
        _id: new mongoose.Types.ObjectId().toString(),
        type: TransactionType.DEBIT,
        amount,
        balanceBefore,
        balanceAfter: wallet.balance,
        reference: uuidv4(),
        description,
        metadata,
        createdAt: new Date(),
      });

      await wallet.save({ session });
      await session.commitTransaction();

      await redis.del(`wallet:balance:${userId}:${type}`);

      await notificationQueue.add('wallet-debit', {
        userId,
        channel: 'WHATSAPP',
        message: `💸 ${wallet.currency} ${amount.toLocaleString()} has been debited from your ${type} wallet. New balance: ${wallet.currency} ${wallet.balance.toLocaleString()}.`,
      });

      return wallet;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ── INITIATE DEPOSIT ──────────────────────────────────────
  async initiateDeposit(userId: string, amount: number, email: string): Promise<{ paymentUrl: string; reference: string }> {
    if (amount < 100) throw new ValidationError('Minimum deposit is NGN 100');

    const reference = `DEP-${uuidv4()}`;
    const result = await paystackService.initializeTransaction({ email, amount: amount * 100, reference, metadata: { userId, type: 'DEPOSIT' } });

    // Store pending deposit in Redis
    await redis.set(`deposit:${reference}`, JSON.stringify({ userId, amount }), 'EX', 3600);

    return { paymentUrl: result.authorization_url, reference };
  }

  // ── CONFIRM DEPOSIT (called by webhook) ───────────────────
  async confirmDeposit(reference: string): Promise<void> {
    const raw = await redis.get(`deposit:${reference}`);
    if (!raw) {
      logger.warn(`[Wallet] Deposit reference not found: ${reference}`);
      return;
    }

    const { userId, amount } = JSON.parse(raw);
    await this.credit(userId, WalletType.NGN, amount, `Wallet deposit — ${reference}`, { reference });
    await redis.del(`deposit:${reference}`);
  }

  // ── WITHDRAW ──────────────────────────────────────────────
  async withdraw(userId: string, data: {
    amount: number;
    bankCode: string;
    accountNumber: string;
    accountName: string;
  }): Promise<{ message: string; reference: string }> {
    const { amount, bankCode, accountNumber, accountName } = data;
    if (amount < 100) throw new ValidationError('Minimum withdrawal is NGN 100');

    const wallet = await this.getWallet(userId, WalletType.NGN);
    if (wallet.balance < amount) throw new AppError('Insufficient balance', 400, 'INSUFFICIENT_BALANCE');

    const reference = `WDR-${uuidv4()}`;

    // Debit wallet first (escrow)
    await this.debit(userId, WalletType.NGN, amount, `Withdrawal to ${accountName} — ${accountNumber}`, { reference, bankCode, accountNumber });

    // Initiate payout via Paystack
    try {
      const recipientCode = await paystackService.createTransferRecipient({ type: 'nuban', name: accountName, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' });
      await paystackService.initiateTransfer({ source: 'balance', amount: amount * 100, recipient: recipientCode, reason: `AgroFinPay withdrawal — ${reference}`, reference });
    } catch (err) {
      // Reverse the debit if payout fails
      await this.credit(userId, WalletType.NGN, amount, `Withdrawal reversal — ${reference}`, { reference });
      throw new AppError('Withdrawal failed. Your balance has been restored.', 500);
    }

    return { message: 'Withdrawal initiated successfully.', reference };
  }

  // ── FREEZE WALLET ─────────────────────────────────────────
  async freezeWallet(userId: string, type: WalletType, reason: string): Promise<void> {
    await Wallet.findOneAndUpdate({ userId, type }, { isFrozen: true, frozenReason: reason });
    await redis.del(`wallet:balance:${userId}:${type}`);
    logger.info(`[Wallet] Frozen: user=${userId} type=${type} reason=${reason}`);
  }

  // ── UNFREEZE WALLET ───────────────────────────────────────
  async unfreezeWallet(userId: string, type: WalletType): Promise<void> {
    await Wallet.findOneAndUpdate({ userId, type }, { isFrozen: false, $unset: { frozenReason: 1 } });
    await redis.del(`wallet:balance:${userId}:${type}`);
    logger.info(`[Wallet] Unfrozen: user=${userId} type=${type}`);
  }

  // ── TRANSACTION HISTORY ───────────────────────────────────
  async getTransactionHistory(
    userId: string,
    type: WalletType,
    options: { limit?: number; offset?: number; transactionType?: TransactionType }
  ) {
    const wallet = await this.getWallet(userId, type);
    let txns = wallet.transactions;

    if (options.transactionType) {
      txns = txns.filter((t) => t.type === options.transactionType);
    }

    // Sort newest first
    txns = [...txns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const offset = options.offset || 0;
    const limit = options.limit || 20;

    return {
      total: txns.length,
      transactions: txns.slice(offset, offset + limit),
    };
  }

  // ── INTERNAL TRANSFER (wallet to wallet between users) ────
  async internalTransfer(fromUserId: string, toUserId: string, amount: number, walletType: WalletType): Promise<void> {
    const ref = `INT-${uuidv4()}`;
    await this.debit(fromUserId, walletType, amount, `Transfer to user — ${ref}`, { reference: ref, toUserId });
    await this.credit(toUserId, walletType, amount, `Transfer received — ${ref}`, { reference: ref, fromUserId });
  }
}

export const walletService = new WalletService();