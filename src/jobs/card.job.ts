import { Worker } from 'bullmq';
import { flutterwaveService } from '../infrastructure/flutterwave';
import { Card } from '../modules/cards/card.model';
import { walletService } from '../modules/wallets/wallet.service';
import { WalletType } from '../core/types/enums';
import { notificationQueue } from '../queues';
import { logger } from '../shared/utils/logger';

export const startCardWorker = () => {
  const worker = new Worker(
    'card',
    async (job) => {
      switch (job.name) {

        case 'create-card': {
          const { cardId, userId, amount, billingData } = job.data;

          const card = await Card.findById(cardId);
          if (!card) throw new Error('Card not found');

          const flwCard = await flutterwaveService.createVirtualCard({
            currency: 'USD',
            amount,
            billing_name: billingData.name,
            billing_address: billingData.address,
            billing_city: billingData.city,
            billing_state: billingData.state,
            billing_postal_code: billingData.postalCode,
            billing_country: 'NG',
          });

          card.gatewayCardId = flwCard.id;
          card.cardNumber = flwCard.card_pan;
          card.expiryMonth = flwCard.expiration.split('/')[0];
          card.expiryYear = flwCard.expiration.split('/')[1];
          card.cvv = flwCard.cvv;
          card.isActive = true;
          await card.save();

          await notificationQueue.add('card-created', {
            userId,
            channel: 'WHATSAPP',
            message: `💳 Your virtual dollar card has been created!\n\nCard: *${card.maskedNumber}*\nExpiry: ${card.expiryMonth}/${card.expiryYear}\n\nUse this for international purchases and subscriptions.`,
          });

          logger.info(`[Card Job] Card created for user ${userId}`);
          break;
        }

        case 'fund-card': {
          const { cardId, userId, amount, gatewayCardId } = job.data;

          await flutterwaveService.fundVirtualCard(gatewayCardId, amount);

          await Card.findByIdAndUpdate(cardId, { $inc: { balance: amount } });

          await notificationQueue.add('card-funded', {
            userId,
            channel: 'WHATSAPP',
            message: `💳 Your virtual dollar card has been funded with $${amount.toFixed(2)}.`,
          });

          logger.info(`[Card Job] Card funded: ${cardId}`);
          break;
        }

        default:
          logger.warn(`[Card Job] Unknown job name: ${job.name}`);
      }
    },
    {
      connection: { host: process.env.REDIS_HOST || 'localhost', port: 6379 },
    }
  );

  worker.on('failed', (job, err) => logger.error(`[Card Job] Failed job ${job?.id}:`, err));
  return worker;
};