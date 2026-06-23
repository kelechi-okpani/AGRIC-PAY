import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';

class TwilioService {
  private client: twilio.Twilio;

  constructor() {
    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  async sendSMS(to: string, message: string): Promise<void> {
    try {
      await this.client.messages.create({
        from: env.TWILIO_PHONE_NUMBER,
        to,
        body: message,
      });
      logger.info(`[Twilio] SMS sent to ${to}`);
    } catch (err) {
      logger.error(`[Twilio] SMS failed to ${to}:`, err);
      throw err;
    }
  }

  async sendWhatsApp(to: string, message: string): Promise<void> {
    try {
      await this.client.messages.create({
        from: env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${to}`,
        body: message,
      });
      logger.info(`[Twilio] WhatsApp sent to ${to}`);
    } catch (err) {
      logger.error(`[Twilio] WhatsApp failed to ${to}:`, err);
      throw err;
    }
  }

  async sendWhatsAppTemplate(to: string, templateSid: string, variables: Record<string, string>): Promise<void> {
    try {
      await this.client.messages.create({
        from: env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${to}`,
        contentSid: templateSid,
        contentVariables: JSON.stringify(variables),
      });
    } catch (err) {
      logger.error(`[Twilio] WhatsApp template failed:`, err);
      throw err;
    }
  }
}

export const twilioService = new TwilioService();