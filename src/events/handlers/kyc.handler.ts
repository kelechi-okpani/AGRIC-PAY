import { eventBus, Events } from '../EventBus';
import { notificationQueue } from '../../queues';
import { walletService } from '../../modules/wallets/wallet.service';
import { logger } from '../../shared/utils/logger';

eventBus.on(Events.USER_REGISTERED, async ({ userId, phone }) => {
  logger.info(`[Event] User registered: ${userId}`);

  // Auto-create wallets
  await walletService.createUserWallets(userId);

  // Send welcome WhatsApp
  await notificationQueue.add('welcome', {
    phone,
    channel: 'WHATSAPP',
    message: `🌾 Welcome to AgroFinPay!\n\nYour NGN, USD, and Crypto wallets have been created.\n\nReply *MENU* to see what you can do.`,
  });
});

eventBus.on(Events.OTP_REQUESTED, async ({ phone, otp, type }) => {
  const { otpQueue } = await import('../../queues');
  await otpQueue.add('send-otp', { phone, otp, type }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
});

eventBus.on(Events.WALLET_FUNDED, async ({ userId, type, amount, balance }) => {
  logger.info(`[Event] Wallet funded: user=${userId} type=${type} amount=${amount}`);
});