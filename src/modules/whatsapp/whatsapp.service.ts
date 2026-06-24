import { whatsAppService } from '../../infrastructure/whatsapp';
import { aiService } from '../ai/ai.service';
import { AIIntent } from '../../core/types/enums';
import { handleTransferIntent } from '../ai/intents/transfer.intent';
import { handleBalanceIntent } from '../ai/intents/balance.intent';
import { handleBuyProductIntent } from '../ai/intents/product.intent';
import { handleFallbackIntent } from '../ai/intents/fallback.intent';
import { handleCardIntent } from '../ai/intents/card.intent';
import { handleSupportIntent } from '../ai/intents/support.intent';
import { handleSwapIntent } from '../ai/intents/swap.intent';
import { User } from '../auth/auth.model';
import { supportService } from '../support/support.service';
import redis from '../../config/redis';
import { logger } from '../../shared/utils/logger';

// ── Interface — extended to accept all Cloud API fields ───────────────────────
export interface IncomingMessagePayload {
  from:             string;
  body:             string;
  mediaUrl?:        string;
  // Extended fields from WhatsApp Cloud API (all optional for backwards compat)
  type?:            string;
  mediaId?:         string;
  location?:        { latitude: number; longitude: number; name?: string; address?: string };
  interactiveReply?:{ type: string; id: string; title: string };
  profileName?:     string;
  messageId?:       string;
}

export class WhatsAppService {

  async handleIncomingMessage(data: IncomingMessagePayload): Promise<void> {
    const phone   = data.from.replace('whatsapp:', '');
    // Prefer the interactive reply title as the message body if present
    const message = data.interactiveReply?.title || data.body?.trim() || '';

    logger.info(`[WhatsApp] Incoming from ${phone}: "${message}" (type: ${data.type || 'text'})`);

    // Find user
    const user = await User.findOne({ phone });

    if (!user) {
      await whatsAppService.sendWelcome(phone, data.profileName || 'there');
      return;
    }

    if (!user.isVerified) {
      await whatsAppService.sendText(phone,
        `Please verify your account first. Type *VERIFY* to get your OTP resent.`
      );
      return;
    }

    if (user.isSuspended) {
      await whatsAppService.sendText(phone,
        `Your account has been suspended. Please contact support at support@agrofinpay.ng`
      );
      return;
    }

    // Check if conversation is escalated to human agent
    const escalated = await redis.get(`support:escalated:${user._id}`);
    if (escalated) {
      await supportService.routeToAgent(user._id.toString(), message);
      return;
    }

    // Track fallback retry count
    const retryKey   = `chat:retry:${user._id}`;
    const retryCount = parseInt((await redis.get(retryKey)) || '0');

    // Detect intent
    const { intent, entities, confidence } = await aiService.detectIntent(message);
    logger.info(`[WhatsApp] Intent: ${intent} (confidence: ${confidence.toFixed(2)}) — user: ${user._id}`);

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

        case AIIntent.CARD:
          reply = await handleCardIntent(user._id.toString(), entities, message);
          await redis.del(retryKey);
          break;

        case AIIntent.SWAP:
          reply = await handleSwapIntent(user._id.toString(), entities, message);
          await redis.del(retryKey);
          break;

        case AIIntent.SUPPORT:
          reply = await handleSupportIntent(user._id.toString(), user.fullName, message);
          await redis.del(retryKey);
          break;

        case AIIntent.ORDER:
          reply = `📦 Send me your order reference number (e.g. *ORD-001*) and I'll track it for you.\n\nOr reply *MY ORDERS* to see your recent orders.`;
          await redis.del(retryKey);
          break;

        case AIIntent.FALLBACK:
        default: {
          const newCount = retryCount + 1;
          await redis.set(retryKey, newCount.toString(), 'EX', 3600);

          if (newCount >= 2) {
            await supportService.escalateToHuman(user._id.toString(), message);
            await redis.set(`support:escalated:${user._id}`, '1', 'EX', 86400);
            await whatsAppService.sendEscalationNotice(phone);
            return;
          }

          reply = await handleFallbackIntent(newCount);
          break;
        }
      }
    } catch (err: any) {
      logger.error('[WhatsApp] Intent handler error:', err);
      reply = `❌ Something went wrong: ${err.message}.\n\nPlease try again or type *HELP* to speak to an agent.`;
    }

    await whatsAppService.sendText(phone, reply);
  }
}

export const whatsappService = new WhatsAppService();