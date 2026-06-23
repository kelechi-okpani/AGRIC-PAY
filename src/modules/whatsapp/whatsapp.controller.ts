import { Request, Response } from 'express';
import { whatsappService } from './whatsapp.service';
import { logger } from '../../shared/utils/logger';

export class WhatsAppController {
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { From, Body, MediaUrl0 } = req.body;
      res.status(200).send('<Response></Response>');

      // Process async so Twilio doesn't time out
      setImmediate(() =>
        whatsappService.handleIncomingMessage({
          from: From,
          body: Body || '',
          mediaUrl: MediaUrl0,
        }).catch((err) => logger.error('[WhatsApp] Webhook handler error:', err))
      );
    } catch (err) {
      logger.error('[WhatsApp] Webhook error:', err);
      res.status(200).send('<Response></Response>');
    }
  }
}

export const whatsappController = new WhatsAppController();