import { Request, Response } from 'express';
import { whatsappService }   from './whatsapp.service';
import { whatsAppService }   from '../../infrastructure/whatsapp';
import { logger }            from '../../shared/utils/logger';

export class WhatsAppController {

  async handleWebhook(req: Request, res: Response): Promise<void> {

    // ── Verify Twilio signature (production only) ──────────────────
    const signature = req.headers['x-twilio-signature'] as string;
    const url       = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    if (process.env.NODE_ENV === 'production') {
      const isValid = whatsAppService.verifyWebhookSignature(
        url,
        req.body,
        signature
      );

      if (!isValid) {
        logger.warn('[WhatsApp] Invalid Twilio signature — rejected');
        res.status(403).send('Forbidden');
        return;
      }
    }

    // ── Respond immediately with empty TwiML ──────────────────────
    // Twilio requires a response within 15 seconds
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');

    // ── Process async so we never block the response ──────────────
    setImmediate(async () => {
      try {
        const message = whatsAppService.parseIncomingMessage(req.body);
        if (!message) return;

        // Strip whatsapp: prefix → plain phone number
        const from = message.from.replace('whatsapp:', '');

        // ── FIX: IncomingWebhookMessage uses 'text' not 'body' ────
        await whatsappService.handleIncomingMessage({
          from:        from,
          body:        message.text || '',   // ← was message.body (wrong)
          mediaUrl:    message.mediaUrl,
          profileName: message.profileName,
          messageId:   message.messageId,
        });

      } catch (err) {
        logger.error('[WhatsApp] Webhook processing error:', err);
      }
    });
  }
}

export const whatsappController = new WhatsAppController();