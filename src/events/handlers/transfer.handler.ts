import { eventBus, Events } from '../EventBus';
import { notificationQueue } from '../../queues';
import { logger } from '../../shared/utils/logger';
import { Transfer } from '../../modules/transfers/transfer.model';
import { User } from '../../modules/auth/auth.model';

eventBus.on(Events.TRANSFER_INITIATED, async ({ transfer }) => {
  logger.info(`[Event] Transfer initiated: ${transfer.reference}`);
});

eventBus.on(Events.TRANSFER_SUCCESS, async ({ transfer }) => {
  logger.info(`[Event] Transfer success: ${transfer.reference}`);

  const sender = await User.findById(transfer.fromUserId);

  await notificationQueue.add('transfer-success-sms', {
    phone: sender?.phone,
    channel: 'SMS',
    message: `AgroFinPay: Transfer of NGN ${transfer.amount.toLocaleString()} successful. Ref: ${transfer.reference}`,
  });
});

eventBus.on(Events.TRANSFER_FAILED, async ({ transfer }) => {
  logger.warn(`[Event] Transfer failed: ${transfer.reference} — ${transfer.failureReason}`);

  const sender = await User.findById(transfer.fromUserId);

  await notificationQueue.add('transfer-failed-notification', {
    userId: transfer.fromUserId.toString(),
    channel: 'WHATSAPP',
    message: `❌ Transfer ${transfer.reference} failed.\nReason: ${transfer.failureReason}\n\nYour wallet has been refunded. Reply *RETRY ${transfer.reference}* to try again.`,
  });
});