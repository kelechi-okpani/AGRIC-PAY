import { Card, ICard } from './card.model';
import { walletService } from '../wallets/wallet.service';
import { flutterwaveService } from '../../infrastructure/flutterwave';
import { cardQueue } from '../../queues';
import { WalletType } from '../../core/types/enums';
import { AppError, NotFoundError, ValidationError } from '../../core/errors/AppError';
import { User } from '../auth/auth.model';

const CARD_CREATION_FEE_USD = 2;
const USD_TO_NGN_RATE = 1600;

export class CardService {

  async createCard(userId: string): Promise<ICard> {
    const existing = await Card.findOne({ userId, isTerminated: false });
    if (existing) throw new ValidationError('You already have an active virtual card');

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');
    if (user.kycLevel < 1) throw new AppError('Complete KYC Level 1 to create a virtual card', 403);

    const feeNGN = CARD_CREATION_FEE_USD * USD_TO_NGN_RATE;
    await walletService.debit(userId, WalletType.NGN, feeNGN, 'Virtual card creation fee', {});

    const card = await Card.create({
      userId,
      maskedNumber: '****  ****  ****  ****',
      currency: 'USD',
    });

    await cardQueue.add('create-card', {
      cardId: card._id.toString(),
      userId,
      amount: 0,
      billingData: {
        name: user.fullName,
        address: '1 AgroFinPay Street',
        city: 'Lagos',
        state: 'Lagos',
        postalCode: '100001',
      },
    }, { attempts: 3 });

    return card;
  }

  async fundCard(userId: string, cardId: string, amountUSD: number): Promise<ICard> {
    if (amountUSD < 1) throw new ValidationError('Minimum fund amount is $1');

    const card = await Card.findOne({ _id: cardId, userId, isTerminated: false });
    if (!card) throw new NotFoundError('Card');
    if (card.isFrozen) throw new AppError('Cannot fund a frozen card', 400);

    const amountNGN = amountUSD * USD_TO_NGN_RATE;
    await walletService.debit(userId, WalletType.NGN, amountNGN, `Card funding — $${amountUSD}`, { cardId });

    await cardQueue.add('fund-card', {
      cardId: card._id.toString(),
      userId,
      amount: amountUSD,
      gatewayCardId: card.gatewayCardId,
    }, { attempts: 3 });

    return card;
  }

  async freezeCard(userId: string, cardId: string): Promise<ICard> {
    const card = await Card.findOne({ _id: cardId, userId });
    if (!card) throw new NotFoundError('Card');
    if (card.isFrozen) throw new ValidationError('Card is already frozen');

    await flutterwaveService.freezeVirtualCard(card.gatewayCardId);
    card.isFrozen = true;
    return card.save();
  }

  async unfreezeCard(userId: string, cardId: string): Promise<ICard> {
    const card = await Card.findOne({ _id: cardId, userId });
    if (!card) throw new NotFoundError('Card');
    if (!card.isFrozen) throw new ValidationError('Card is not frozen');

    await flutterwaveService.unfreezeVirtualCard(card.gatewayCardId);
    card.isFrozen = false;
    return card.save();
  }

  async terminateCard(userId: string, cardId: string): Promise<ICard> {
    const card = await Card.findOne({ _id: cardId, userId });
    if (!card) throw new NotFoundError('Card');
    if (card.isTerminated) throw new ValidationError('Card is already terminated');

    await flutterwaveService.terminateVirtualCard(card.gatewayCardId);
    card.isTerminated = true;
    card.isActive = false;
    return card.save();
  }

  async getUserCards(userId: string): Promise<ICard[]> {
    return Card.find({ userId, isTerminated: false });
  }

  async getCardTransactions(userId: string, cardId: string, from: string, to: string) {
    const card = await Card.findOne({ _id: cardId, userId });
    if (!card) throw new NotFoundError('Card');
    return flutterwaveService.getVirtualCardTransactions(card.gatewayCardId, from, to, 0, 20);
  }
}

export const cardService = new CardService();