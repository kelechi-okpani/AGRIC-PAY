import { twilioService } from '../../infrastructure/twilio';
import { aiService } from '../ai/ai.service';
import { AIIntent } from '../../core/types/enums';
import { handleTransferIntent } from '../ai/intents/transfer.intent';
import { handleBalanceIntent } from '../ai/intents/balance.intent';
import { handleBuyProductIntent } from '../ai/intents/product.intent';
import { handleFallbackIntent } from '../ai/intents/fallback.intent';
import { User } from '../auth/auth.model';
import { supportService } from '../support/support.service';
import redis from '../../config/redis';
import { logger } from '../../shared/utils/logger';

export class WhatsAppService {

  async handleIncomingMessage(data: {
    from: string;
    body: string;
    mediaUrl?: string;
  }): Promise<void> {
    const phone = data.from.replace('whatsapp:', '');
    const message = data.body.trim();

    logger.info(`[WhatsApp] Incoming from ${phone}: ${message}`);

    // Find or prompt registration
    const user = await User.findOne({ phone });

    if (!user) {
      await twilioService.sendWhatsApp(phone,
        `👋 Welcome to AgroFinPay! 🌾\n\nI'm Agro, your financial & marketplace assistant.\n\nTo get started, please register at our platform or type *REGISTER* to begin.`
      );
      return;
    }

    if (!user.isVerified) {
      await twilioService.sendWhatsApp(phone, `Please verify your account first. Type *VERIFY* to get your OTP resent.`);
      return;
    }

    // Check for human escalation state
    const escalated = await redis.get(`support:escalated:${user._id}`);
    if (escalated) {
      await supportService.routeToAgent(user._id.toString(), message);
      return;
    }

    // Get retry count for fallback tracking
    const retryKey = `chat:retry:${user._id}`;
    const retryCount = parseInt(await redis.get(retryKey) || '0');

    // Detect intent
    const { intent, entities, confidence } = await aiService.detectIntent(message);
    logger.info(`[WhatsApp] Intent: ${intent} (${confidence}) for user ${user._id}`);

    let reply: string;

    try {
      switch (intent) {
        case AIIntent.TRANSFER:
          reply = await handleTransferIntent(user._id.toString(), entities, message);
          await redis.del(retryKey);
          break;

        case AIIntent.BALANCE:
          reply = await handleBalanceIntent(user._id.toString());
          await redis.del(retryKey);
          break;

        case AIIntent.BUY_PRODUCT:
          reply = await handleBuyProductIntent(user._id.toString(), entities, message);
          await redis.del(retryKey);
          break;

        case AIIntent.SUPPORT:
          reply = await this.handleSupportIntent(user._id.toString(), user.fullName, message);
          await redis.del(retryKey);
          break;

        case AIIntent.ORDER:
          reply = `📦 Reply *MY ORDERS* to see your recent orders, or give me your order reference number.`;
          break;

        case AIIntent.FALLBACK:
        default:
          const newCount = retryCount + 1;
          await redis.set(retryKey, newCount.toString(), 'EX', 3600);

          if (newCount >= 2) {
            await supportService.escalateToHuman(user._id.toString(), message);
            await redis.set(`support:escalated:${user._id}`, '1', 'EX', 86400);
          }

          reply = await handleFallbackIntent(newCount);
          break;
      }
    } catch (err: any) {
      logger.error('[WhatsApp] Intent handler error:', err);
      reply = `❌ Something went wrong: ${err.message}. Please try again or type *HELP* to speak to an agent.`;
    }

    await twilioService.sendWhatsApp(phone, reply);
  }

  private async handleSupportIntent(userId: string, name: string, message: string): Promise<string> {
    await supportService.createTicket(userId, message);
    return `🆘 Support ticket created!\n\nHi ${name}, a support agent will be with you shortly.\n\nYou can also continue describing your issue here and I'll pass it along.`;
  }
}

export const whatsappService = new WhatsAppService();