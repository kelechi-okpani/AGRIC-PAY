import { Card, ICard }         from './card.model';
import { walletService }       from '../wallets/wallet.service';
import { paystackService }     from '../../infrastructure/paystack';
import { cardQueue }           from '../../queues';
import { notificationQueue }   from '../../queues';
import { WalletType }          from '../../core/types/enums';
import {
  AppError,
  NotFoundError,
  ValidationError,
} from '../../core/errors/AppError';
import { User } from '../auth/auth.model';
import { logger } from '../../shared/utils/logger';

// Live exchange rate — in production fetch this from an FX API or your crypto service
const USD_TO_NGN_RATE      = 1600;
const CARD_CREATION_FEE_USD = 2;

export class CardService {

  // ── CREATE VIRTUAL CARD ───────────────────────────────────────────
  async createCard(userId: string): Promise<ICard> {
    // One active card per user
    const existing = await Card.findOne({ userId, isTerminated: false });
    if (existing) throw new ValidationError(
      'You already have an active virtual dollar card.\n\nReply *CARD* to manage it.'
    );

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    if (user.kycLevel < 1) throw new AppError(
      'You need to complete identity verification (KYC Level 1) before creating a virtual card.\n\nReply *KYC* to verify your identity.',
      403
    );

    // Debit creation fee from NGN wallet
    const feeNGN = CARD_CREATION_FEE_USD * USD_TO_NGN_RATE;
    await walletService.debit(
      userId,
      WalletType.NGN,
      feeNGN,
      `Virtual dollar card creation fee ($${CARD_CREATION_FEE_USD})`,
      {}
    );

    // Create placeholder card record — job will fill in the real details
    const card = await Card.create({
      userId,
      maskedNumber: '**** **** **** ****',
      currency:     'USD',
      isActive:     false,
    });

    // Queue the actual card creation with Paystack
    await cardQueue.add(
      'create-card',
      {
        cardId: card._id.toString(),
        userId,
        billingData: {
          name:       user.fullName,
          address:    '1 AgroFinPay Street',
          city:       'Lagos',
          state:      'Lagos',
          postalCode: '100001',
        },
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 3000 } }
    );

    logger.info(`[Card] Creation queued for user=${userId}`);
    return card;
  }

  // ── FUND CARD ─────────────────────────────────────────────────────
  async fundCard(userId: string, cardId: string, amountUSD: number): Promise<ICard> {
    if (amountUSD < 1) throw new ValidationError('Minimum funding amount is $1.');

    const card = await Card.findOne({ _id: cardId, userId, isTerminated: false });
    if (!card)         throw new NotFoundError('Card');
    if (!card.isActive) throw new AppError('Card is not yet active. Please wait a moment and try again.', 400);
    if (card.isFrozen)  throw new AppError('Cannot fund a frozen card. Unfreeze it first.', 400);

    const amountNGN = amountUSD * USD_TO_NGN_RATE;

    await walletService.debit(
      userId,
      WalletType.NGN,
      amountNGN,
      `Virtual card funding — $${amountUSD}`,
      { cardId }
    );

    await cardQueue.add(
      'fund-card',
      {
        cardId:        card._id.toString(),
        userId,
        amount:        amountUSD,
        gatewayCardId: card.gatewayCardId,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 3000 } }
    );

    logger.info(`[Card] Fund queued: cardId=${cardId} amount=$${amountUSD}`);
    return card;
  }

  // ── FREEZE CARD ───────────────────────────────────────────────────
  async freezeCard(userId: string, cardId: string): Promise<ICard> {
    const card = await Card.findOne({ _id: cardId, userId, isTerminated: false });
    if (!card)          throw new NotFoundError('Card');
    if (card.isFrozen)  throw new ValidationError('Your card is already frozen.');
    if (!card.isActive) throw new AppError('Card is not yet active.', 400);

    await paystackService.freezeVirtualCard(card.gatewayCardId);

    card.isFrozen = true;
    await card.save();

    await notificationQueue.add('card-frozen', {
      userId,
      channel: 'WHATSAPP',
      message:
        `🔴 *Card Frozen*\n\n` +
        `Your virtual dollar card (*${card.maskedNumber}*) has been frozen.\n\n` +
        `Reply *UNFREEZE* to reactivate it.`,
    });

    logger.info(`[Card] Frozen: cardId=${cardId}`);
    return card;
  }

  // ── UNFREEZE CARD ─────────────────────────────────────────────────
  async unfreezeCard(userId: string, cardId: string): Promise<ICard> {
    const card = await Card.findOne({ _id: cardId, userId, isTerminated: false });
    if (!card)          throw new NotFoundError('Card');
    if (!card.isFrozen) throw new ValidationError('Your card is not currently frozen.');

    await paystackService.unfreezeVirtualCard(card.gatewayCardId);

    card.isFrozen = false;
    await card.save();

    await notificationQueue.add('card-unfrozen', {
      userId,
      channel: 'WHATSAPP',
      message:
        `🟢 *Card Unfrozen*\n\n` +
        `Your virtual dollar card (*${card.maskedNumber}*) is active again.\n\n` +
        `Reply *CARD* to manage it.`,
    });

    logger.info(`[Card] Unfrozen: cardId=${cardId}`);
    return card;
  }

  // ── TERMINATE CARD ────────────────────────────────────────────────
  async terminateCard(userId: string, cardId: string): Promise<ICard> {
    const card = await Card.findOne({ _id: cardId, userId });
    if (!card)             throw new NotFoundError('Card');
    if (card.isTerminated) throw new ValidationError('This card has already been terminated.');

    await paystackService.terminateVirtualCard(card.gatewayCardId);

    card.isTerminated = true;
    card.isActive     = false;
    card.isFrozen     = false;
    await card.save();

    await notificationQueue.add('card-terminated', {
      userId,
      channel: 'WHATSAPP',
      message:
        `⚫ *Card Terminated*\n\n` +
        `Your virtual dollar card (*${card.maskedNumber}*) has been permanently cancelled.\n\n` +
        `Reply *CARD* to create a new one.`,
    });

    logger.info(`[Card] Terminated: cardId=${cardId}`);
    return card;
  }

  // ── GET USER CARDS ────────────────────────────────────────────────
  async getUserCards(userId: string): Promise<ICard[]> {
    return Card.find({ userId, isTerminated: false }).sort({ createdAt: -1 });
  }

  // ── GET CARD TRANSACTIONS ─────────────────────────────────────────
  async getCardTransactions(
    userId: string,
    cardId: string,
    from:   string,
    to:     string
  ): Promise<any[]> {
    const card = await Card.findOne({ _id: cardId, userId });
    if (!card) throw new NotFoundError('Card');
    if (!card.gatewayCardId) throw new AppError('Card not yet fully activated.', 400);

    return paystackService.getVirtualCardTransactions(card.gatewayCardId, from, to);
  }

  // ── GET CARD DETAILS (live from Paystack) ─────────────────────────
  async getCardDetails(userId: string, cardId: string): Promise<any> {
    const card = await Card.findOne({ _id: cardId, userId });
    if (!card) throw new NotFoundError('Card');
    if (!card.gatewayCardId) throw new AppError('Card not yet fully activated.', 400);

    const liveDetails = await paystackService.getVirtualCard(card.gatewayCardId);

    // Sync balance from Paystack
    if (liveDetails.balance !== undefined) {
      await Card.findByIdAndUpdate(cardId, { balance: liveDetails.balance / 100 });
      card.balance = liveDetails.balance / 100;
    }

    return card;
  }
}

export const cardService = new CardService();