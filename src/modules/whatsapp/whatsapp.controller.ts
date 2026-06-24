import { Request, Response } from 'express';
import { whatsappService } from './whatsapp.service';
import { whatsAppService } from '../../infrastructure/whatsapp';
import { logger } from '../../shared/utils/logger';

export class WhatsAppController {

  async handleWebhook(req: Request, res: Response): Promise<void> {
    // Verify signature from Meta
    const signature = req.headers['x-hub-signature-256'] as string;
    const payload   = JSON.stringify(req.body);

    if (!whatsAppService.verifyWebhookSignature(payload, signature)) {
      logger.warn('[WhatsApp] Invalid webhook signature — rejected');
      res.sendStatus(401);
      return;
    }

    // Respond immediately — Meta requires 200 within 20s
    res.sendStatus(200);

    // Parse and process async
    setImmediate(async () => {
      try {
        const message = whatsAppService.parseIncomingMessage(req.body);
        if (!message) return;

        // Mark message as read (shows double blue ticks)
        await whatsAppService.markAsRead(message.messageId);

        // Only pass the fields the WhatsApp service interface expects
        await whatsappService.handleIncomingMessage({
          from:    message.from,
          body:    message.text || '',
          mediaUrl: message.mediaUrl,
        });

      } catch (err) {
        logger.error('[WhatsApp] Webhook processing error:', err);
      }
    });
  }
}

export const whatsappController = new WhatsAppController();