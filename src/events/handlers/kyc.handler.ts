import { eventBus, Events } from '../EventBus';
import { walletService } from '../../modules/wallets/wallet.service';
import { notificationQueue } from '../../queues';
import { logger } from '../../shared/utils/logger';

// ── USER REGISTERED ───────────────────────────────────────────────────────────
eventBus.on(Events.USER_REGISTERED, async ({ userId, phone }) => {
  logger.info(`[Event] User registered: ${userId}`);

  // Auto-create all three wallets
  await walletService.createUserWallets(userId);

  // Send welcome message via WhatsApp Cloud API through the notification queue
  await notificationQueue.add('welcome', {
    phone,
    channel: 'WHATSAPP',
    message:
      `🌾 Welcome to *AgroFinPay*!\n\n` +
      `Your NGN, USD, and Crypto wallets have been created.\n\n` +
      `Here's what you can do:\n` +
      `💸 *TRANSFER* — Send money\n` +
      `💰 *BALANCE* — Check wallet\n` +
      `🌾 *BUY* — Shop agro products\n` +
      `💳 *CARD* — Virtual dollar card\n` +
      `🪙 *CRYPTO* — Buy & swap crypto\n` +
      `🆘 *HELP* — Talk to support\n\n` +
      `Reply with any command to get started! 🚀`,
  });
});

// ── OTP REQUESTED ─────────────────────────────────────────────────────────────
eventBus.on(Events.OTP_REQUESTED, async ({ phone, otp, type }) => {
  const { otpQueue } = await import('../../queues');
  await otpQueue.add(
    'send-otp',
    { phone, otp, type: type || 'register' },
    {
      attempts: 3,
      backoff:  { type: 'exponential', delay: 2000 },
    }
  );
});

// ── WALLET FUNDED ─────────────────────────────────────────────────────────────
eventBus.on(Events.WALLET_FUNDED, async ({ userId, type, amount, balance }) => {
  logger.info(`[Event] Wallet funded: user=${userId} type=${type} amount=${amount} newBalance=${balance}`);
});

// ── KYC SUBMITTED ─────────────────────────────────────────────────────────────
eventBus.on(Events.KYC_SUBMITTED, async ({ userId }) => {
  logger.info(`[Event] KYC submitted for review: userId=${userId}`);

  await notificationQueue.add('kyc-submitted', {
    userId,
    channel: 'WHATSAPP',
    message: `🪪 *KYC Submitted*\n\nYour documents are under review. We'll notify you within 24 hours. Thank you for your patience!`,
  });
});

// ── KYC APPROVED ─────────────────────────────────────────────────────────────
eventBus.on(Events.KYC_APPROVED, async ({ userId }) => {
  logger.info(`[Event] KYC approved: userId=${userId}`);

  await notificationQueue.add('kyc-approved', {
    userId,
    channel: 'WHATSAPP',
    message:
      `🎉 *KYC Approved!*\n\n` +
      `Your identity has been verified. You now have full access:\n` +
      `✅ ₦2,000,000 daily transfer limit\n` +
      `✅ Virtual dollar card\n` +
      `✅ Crypto trading\n\n` +
      `Reply *MENU* to get started.`,
  });
});

// ── KYC REJECTED ─────────────────────────────────────────────────────────────
eventBus.on(Events.KYC_REJECTED, async ({ userId, reason }) => {
  logger.info(`[Event] KYC rejected: userId=${userId}`);

  await notificationQueue.add('kyc-rejected', {
    userId,
    channel: 'WHATSAPP',
    message:
      `❌ *KYC Rejected*\n\n` +
      `Your KYC submission was rejected.\n` +
      `*Reason:* ${reason || 'Documents could not be verified.'}\n\n` +
      `Reply *KYC* to resubmit your documents.`,
  });
});


// import { eventBus, Events } from '../EventBus';
// import { notificationQueue } from '../../queues';
// import { walletService } from '../../modules/wallets/wallet.service';
// import { logger } from '../../shared/utils/logger';

// eventBus.on(Events.USER_REGISTERED, async ({ userId, phone }) => {
//   logger.info(`[Event] User registered: ${userId}`);

//   // Auto-create wallets
//   await walletService.createUserWallets(userId);

//   // Send welcome WhatsApp
//   await notificationQueue.add('welcome', {
//     phone,
//     channel: 'WHATSAPP',
//     message: `🌾 Welcome to AgroFinPay!\n\nYour NGN, USD, and Crypto wallets have been created.\n\nReply *MENU* to see what you can do.`,
//   });
// });

// eventBus.on(Events.OTP_REQUESTED, async ({ phone, otp, type }) => {
//   const { otpQueue } = await import('../../queues');
//   await otpQueue.add('send-otp', { phone, otp, type }, {
//     attempts: 3,
//     backoff: { type: 'exponential', delay: 2000 },
//   });
// });

// eventBus.on(Events.WALLET_FUNDED, async ({ userId, type, amount, balance }) => {
//   logger.info(`[Event] Wallet funded: user=${userId} type=${type} amount=${amount}`);
// });