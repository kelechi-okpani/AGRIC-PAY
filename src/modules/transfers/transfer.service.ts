import { v4 as uuidv4 } from 'uuid';
import { Transfer, ITransfer } from './transfer.model';
import { TransferStatus, WalletType } from '../../core/types/enums';
import { walletService } from '../wallets/wallet.service';
import { paystackService } from '../../infrastructure/paystack';
import { notificationQueue, transferQueue } from '../../queues';
import { eventBus, Events } from '../../events/EventBus';
import { AppError, NotFoundError, ValidationError } from '../../core/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { User } from '../auth/auth.model';

const TRANSFER_FEES = {
  INTERNAL: 0,
  BANK: (amount: number) => (amount <= 5000 ? 10 : amount <= 50000 ? 25 : 50),
  CROSS_BORDER: (amount: number) => amount * 0.015,
};

export class TransferService {

  // ── INTERNAL TRANSFER ─────────────────────────────────────
  async internalTransfer(fromUserId: string, data: {
    toPhone: string;
    amount: number;
    narration?: string;
  }): Promise<ITransfer> {
    const { toPhone, amount, narration } = data;
    if (amount < 1) throw new ValidationError('Minimum transfer is NGN 1');

    const recipient = await User.findOne({ phone: toPhone });
    if (!recipient) throw new NotFoundError('Recipient');
    if (recipient._id.toString() === fromUserId) throw new ValidationError('Cannot transfer to yourself');

    const reference = `INT-${uuidv4()}`;

    const transfer = await Transfer.create({
      fromUserId,
      toUserId: recipient._id,
      amount,
      fee: TRANSFER_FEES.INTERNAL,
      currency: 'NGN',
      type: 'INTERNAL',
      status: TransferStatus.PROCESSING,
      reference,
      narration,
    });

    try {
      await walletService.internalTransfer(fromUserId, recipient._id.toString(), amount, WalletType.NGN);
      transfer.status = TransferStatus.SUCCESS;
      await transfer.save();

      eventBus.emit(Events.TRANSFER_SUCCESS, { transfer });

      await notificationQueue.add('transfer-success', {
        userId: fromUserId,
        channel: 'WHATSAPP',
        message: `✅ Transfer of ₦${amount.toLocaleString()} to ${recipient.fullName} was successful.\nRef: ${reference}`,
      });

      await notificationQueue.add('transfer-received', {
        userId: recipient._id.toString(),
        channel: 'WHATSAPP',
        message: `💰 You received ₦${amount.toLocaleString()} from ${(await User.findById(fromUserId))?.fullName}.\nRef: ${reference}`,
      });

    } catch (err) {
      transfer.status = TransferStatus.FAILED;
      transfer.failureReason = (err as Error).message;
      await transfer.save();
      eventBus.emit(Events.TRANSFER_FAILED, { transfer });
      throw err;
    }

    return transfer;
  }

  // ── BANK TRANSFER ─────────────────────────────────────────
  async bankTransfer(fromUserId: string, data: {
    amount: number;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    bankName: string;
    narration?: string;
  }): Promise<ITransfer> {
    const { amount, bankCode, accountNumber, accountName, bankName, narration } = data;
    if (amount < 100) throw new ValidationError('Minimum bank transfer is NGN 100');

    const fee = TRANSFER_FEES.BANK(amount);
    const totalAmount = amount + fee;
    const reference = `BNK-${uuidv4()}`;

    const transfer = await Transfer.create({
      fromUserId,
      amount,
      fee,
      currency: 'NGN',
      type: 'BANK',
      status: TransferStatus.PENDING,
      reference,
      bankCode,
      accountNumber,
      accountName,
      bankName,
      narration,
    });

    await transferQueue.add('bank-transfer', { transferId: transfer._id, fromUserId, amount: totalAmount, reference, bankCode, accountNumber, accountName }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });

    return transfer;
  }

  // ── PROCESS BANK TRANSFER (called by queue worker) ────────
  async processBankTransfer(data: {
    transferId: string;
    fromUserId: string;
    amount: number;
    reference: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
  }): Promise<void> {
    const transfer = await Transfer.findById(data.transferId);
    if (!transfer) throw new NotFoundError('Transfer');

    transfer.status = TransferStatus.PROCESSING;
    await transfer.save();

    try {
      await walletService.debit(data.fromUserId, WalletType.NGN, data.amount, `Bank transfer — ${data.reference}`, { reference: data.reference });

      const recipientCode = await paystackService.createTransferRecipient({
        type: 'nuban',
        name: data.accountName,
        account_number: data.accountNumber,
        bank_code: data.bankCode,
        currency: 'NGN',
      });

      const result = await paystackService.initiateTransfer({
        source: 'balance',
        amount: data.amount * 100,
        recipient: recipientCode,
        reason: data.reference,
        reference: data.reference,
      });

      transfer.gatewayReference = result.transfer_code;
      transfer.status = TransferStatus.PROCESSING;
      await transfer.save();

    } catch (err) {
      transfer.status = TransferStatus.FAILED;
      transfer.failureReason = (err as Error).message;
      transfer.retryCount += 1;
      await transfer.save();
      throw err;
    }
  }

  // ── SCHEDULED TRANSFER ────────────────────────────────────
  async scheduleTransfer(fromUserId: string, data: {
    toPhone?: string;
    bankCode?: string;
    accountNumber?: string;
    accountName?: string;
    amount: number;
    scheduledAt: Date;
    narration?: string;
  }): Promise<ITransfer> {
    
    if (new Date(data.scheduledAt) <= new Date()) throw new ValidationError('Scheduled date must be in the future');

    const reference = `SCH-${uuidv4()}`;
    const transfer = await Transfer.create({
      fromUserId,
      ...data,
      fee: 0,
      currency: 'NGN',
      type: 'SCHEDULED',
      status: TransferStatus.PENDING,
      reference,
    });


    //    const transfer = await Transfer.create({
    //   fromUserId,
    //   amount: data.amount,
    //   fee: 0,
    //   currency: 'NGN',
    //   type: 'SCHEDULED',
    //   status: TransferStatus.PENDING,
    //   reference,
    //   scheduledAt: data.scheduledAt,
    //   ...data,
    // });

    await transferQueue.add('scheduled-transfer', { transferId: transfer._id.toString() }, {
      delay: new Date(data.scheduledAt).getTime() - Date.now(),
    });

    return transfer;
  }

  // ── RECURRING TRANSFER ────────────────────────────────────
  async createRecurringTransfer(fromUserId: string, data: {
    toPhone: string;
    amount: number;
    interval: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    endDate: Date;
    narration?: string;
  }): Promise<ITransfer> {
    const reference = `REC-${uuidv4()}`;
    return Transfer.create({
      fromUserId,
      amount: data.amount,
      fee: 0,
      currency: 'NGN',
      type: 'RECURRING',
      status: TransferStatus.PENDING,
      reference,
      recurringInterval: data.interval,
      recurringEndDate: data.endDate,
      narration: data.narration,
    });
  }

  // ── RETRY FAILED TRANSFER ─────────────────────────────────
  async retryTransfer(transferId: string, requesterId: string): Promise<ITransfer> {
    const transfer = await Transfer.findById(transferId);
    if (!transfer) throw new NotFoundError('Transfer');
    if (transfer.fromUserId.toString() !== requesterId) throw new AppError('Unauthorized', 403);
    if (transfer.status !== TransferStatus.FAILED) throw new ValidationError('Only failed transfers can be retried');
    if (transfer.retryCount >= 3) throw new AppError('Maximum retry attempts reached', 400);

    transfer.status = TransferStatus.PENDING;
    transfer.retryCount += 1;
    await transfer.save();

    await transferQueue.add('bank-transfer', {
      transferId: transfer._id,
      fromUserId: transfer.fromUserId,
      amount: transfer.amount + transfer.fee,
      reference: transfer.reference,
      bankCode: transfer.bankCode,
      accountNumber: transfer.accountNumber,
      accountName: transfer.accountName,
    });

    return transfer;
  }

  // ── CANCEL TRANSFER ───────────────────────────────────────
  async cancelTransfer(transferId: string, requesterId: string): Promise<ITransfer> {
    const transfer = await Transfer.findById(transferId);
    if (!transfer) throw new NotFoundError('Transfer');
    if (transfer.fromUserId.toString() !== requesterId) throw new AppError('Unauthorized', 403);
    if (transfer.status !== TransferStatus.PENDING) throw new ValidationError('Only pending transfers can be cancelled');

    transfer.status = TransferStatus.FAILED;
    transfer.failureReason = 'Cancelled by user';
    await transfer.save();
    return transfer;
  }

  // ── REFUND ────────────────────────────────────────────────
  async refundTransfer(transferId: string, adminId: string): Promise<void> {
    const transfer = await Transfer.findById(transferId);
    if (!transfer) throw new NotFoundError('Transfer');
    if (transfer.status !== TransferStatus.FAILED && transfer.status !== TransferStatus.SUCCESS) {
      throw new ValidationError('Transfer cannot be refunded in current state');
    }

    await walletService.credit(
      transfer.fromUserId.toString(),
      WalletType.NGN,
      transfer.amount,
      `Refund for transfer ${transfer.reference}`,
      { refundedBy: adminId, originalReference: transfer.reference }
    );

    transfer.status = TransferStatus.REVERSED;
    await transfer.save();
  }

  // ── WEBHOOK HANDLERS ──────────────────────────────────────
  async handleWebhookSuccess(reference: string): Promise<void> {
    const transfer = await Transfer.findOne({ reference });
    if (!transfer) return;
    transfer.status = TransferStatus.SUCCESS;
    await transfer.save();
    eventBus.emit(Events.TRANSFER_SUCCESS, { transfer });

    await notificationQueue.add('transfer-success', {
      userId: transfer.fromUserId.toString(),
      channel: 'WHATSAPP',
      message: `✅ Your bank transfer of ₦${transfer.amount.toLocaleString()} to ${transfer.accountName} was successful.\nRef: ${reference}`,
    });
  }

  async handleWebhookFailure(reference: string, event: string): Promise<void> {
    const transfer = await Transfer.findOne({ reference });
    if (!transfer) return;

    transfer.status = TransferStatus.FAILED;
    transfer.failureReason = event === 'transfer.reversed' ? 'Reversed by bank' : 'Transfer failed at gateway';
    await transfer.save();

    // Refund user wallet
    await walletService.credit(
      transfer.fromUserId.toString(),
      WalletType.NGN,
      transfer.amount + transfer.fee,
      `Refund for failed transfer ${reference}`,
      { reference }
    );

    eventBus.emit(Events.TRANSFER_FAILED, { transfer });
  }

  // ── GET TRANSFERS ─────────────────────────────────────────
  async getUserTransfers(userId: string, filters: {
    status?: TransferStatus;
    type?: string;
    limit?: number;
    offset?: number;
  }) {
    const query: any = { fromUserId: userId };
    if (filters.status) query.status = filters.status;
    if (filters.type) query.type = filters.type;

    const [transfers, total] = await Promise.all([
      Transfer.find(query).sort({ createdAt: -1 }).skip(filters.offset || 0).limit(filters.limit || 20),
      Transfer.countDocuments(query),
    ]);

    return { transfers, total };
  }

  async getTransferById(transferId: string, userId: string): Promise<ITransfer> {
    const transfer = await Transfer.findOne({ _id: transferId, fromUserId: userId });
    if (!transfer) throw new NotFoundError('Transfer');
    return transfer;
  }
}

export const transferService = new TransferService();