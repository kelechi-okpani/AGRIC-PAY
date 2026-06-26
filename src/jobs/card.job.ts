import { Worker }            from 'bullmq';
import { paystackService }   from '../infrastructure/paystack';
import { notificationQueue } from '../queues';
import { logger }            from '../shared/utils/logger';
import { Card } from '@modules/cards/card.model';

export const startCardWorker = () => {
  const worker = new Worker(
    'card',
    async (job) => {
      switch (job.name) {

        // ── CREATE VIRTUAL CARD ──────────────────────────────────────
        case 'create-card': {
          const { cardId, userId, billingData } = job.data;

          const card = await Card.findById(cardId);
          if (!card) throw new Error(`Card not found: ${cardId}`);

          // Create virtual card via Paystack
          const psCard = await paystackService.createVirtualCard({
            currency:            'USD',
            holder_name:         billingData.name,
            billing_address:     billingData.address,
            billing_city:        billingData.city,
            billing_state:       billingData.state,
            billing_postal_code: billingData.postalCode,
            billing_country:     'NG',
          });

          // Update card record with gateway details
          card.gatewayCardId = psCard.id;
          card.cardNumber    = psCard.card_pan;
          card.maskedNumber  = `**** **** **** ${psCard.card_pan.slice(-4)}`;
          card.expiryMonth   = psCard.expiry_month;
          card.expiryYear    = psCard.expiry_year;
          card.cvv           = psCard.cvv;
          card.isActive      = true;
          await card.save();

          await notificationQueue.add('card-created', {
            userId,
            channel: 'WHATSAPP',
            message:
              `💳 *Your Virtual Dollar Card is Ready!*\n\n` +
              `Card: *${card.maskedNumber}*\n` +
              `Expiry: ${card.expiryMonth}/${card.expiryYear}\n\n` +
              `Use it for international purchases and subscriptions.\n\n` +
              `Reply *CARD* to manage your card.`,
          });

          logger.info(`[Card Job] Card created for user ${userId}: ${card.maskedNumber}`);
          break;
        }

        // ── FUND VIRTUAL CARD ────────────────────────────────────────
        case 'fund-card': {
          const { cardId, userId, amount, gatewayCardId } = job.data;

          // Fund card via Paystack
          await paystackService.fundVirtualCard(gatewayCardId, amount);

          // Update balance in database
          await Card.findByIdAndUpdate(cardId, { $inc: { balance: amount } });

          await notificationQueue.add('card-funded', {
            userId,
            channel: 'WHATSAPP',
            message:
              `💳 *Card Funded!*\n\n` +
              `*$${Number(amount).toFixed(2)}* has been added to your virtual dollar card.\n\n` +
              `Reply *CARD* to check your balance.`,
          });

          logger.info(`[Card Job] Card funded: cardId=${cardId} amount=$${amount}`);
          break;
        }

        default:
          logger.warn(`[Card Job] Unknown job name: ${job.name}`);
      }
    },
    {
      connection: {
        host:     process.env.REDIS_HOST || 'localhost',
        port:     parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }
  );

  worker.on('completed', (job) =>
    logger.info(`[Card Job] Completed: ${job.id} — ${job.name}`)
  );
  worker.on('failed', (job, err) =>
    logger.error(`[Card Job] Failed: ${job?.id} — ${job?.name}:`, err.message)
  );

  return worker;
};