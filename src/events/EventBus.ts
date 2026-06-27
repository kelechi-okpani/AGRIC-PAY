// import EventEmitter from 'events';
import { EventEmitter } from "node:events";
import { logger } from '../shared/utils/logger';

class EventBus extends EventEmitter {
  emit(event: string, ...args: any[]): boolean {
    logger.debug(`[EventBus] Emitting: ${event}`);
    return super.emit(event, ...args);
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(50);

export const Events = {
  USER_REGISTERED: 'user.registered',
  OTP_REQUESTED: 'otp.requested',
  KYC_SUBMITTED: 'kyc.submitted',
  KYC_APPROVED: 'kyc.approved',
  KYC_REJECTED: 'kyc.rejected',
  TRANSFER_INITIATED: 'transfer.initiated',
  TRANSFER_SUCCESS: 'transfer.success',
  TRANSFER_FAILED: 'transfer.failed',
  ORDER_PLACED: 'order.placed',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_DELIVERED: 'order.delivered',
  CARD_CREATED: 'card.created',
  WALLET_FUNDED: 'wallet.funded',
  WHATSAPP_MESSAGE_RECEIVED: 'whatsapp.message.received',
  SUPPORT_TICKET_CREATED: 'support.ticket.created',
  SUPPORT_ESCALATED: 'support.escalated',
} as const;