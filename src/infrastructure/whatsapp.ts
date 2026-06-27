import twilio, { Twilio }  from 'twilio';
import { env }             from '../config/env';
import { AppError }        from '../core/errors/AppError';
import { logger }          from '../shared/utils/logger';

// ── TYPES — kept identical to before so nothing else breaks ───────────────────
export interface TextMessage {
  to:   string;
  body: string;
}

export interface TemplateMessage {
  to:            string;
  templateName:  string;
  languageCode?: string;
  components?:   any[];
  variables?:    string[]; // Twilio content template variables
}

export interface MediaMessage {
  to:        string;
  type:      'image' | 'document' | 'audio' | 'video';
  mediaUrl:  string;
  caption?:  string;
  filename?: string;
}

export interface InteractiveMessage {
  to:            string;
  body:          string;
  footer?:       string;
  buttons?:      { id: string; title: string }[];
  listTitle?:    string;
  listSections?: {
    title: string;
    rows:  { id: string; title: string; description?: string }[];
  }[];
}

export interface LocationMessage {
  to:        string;
  latitude:  number;
  longitude: number;
  name?:     string;
  address?:  string;
}

export interface IncomingWebhookMessage {
  from:              string;
  messageId:         string;
  type:              string;
  text?:             string;
  mediaId?:          string;
  mediaUrl?:         string;
  caption?:          string;
  interactiveReply?: { type: string; id: string; title: string };
  location?:         { latitude: number; longitude: number; name?: string; address?: string };
  timestamp:         number;
  profileName?:      string;
}

// ── SERVICE ───────────────────────────────────────────────────────────────────
class WhatsAppService {
  private client:     Twilio;
  private fromNumber: string;

  constructor() {
    this.client     = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    this.fromNumber = env.TWILIO_WHATSAPP_NUMBER; // whatsapp:+14155238886
  }

  // ── FORMAT PHONE ──────────────────────────────────────────────────
  private formatPhone(phone: string): string {
    // Remove any existing whatsapp: prefix
    const clean = phone.replace('whatsapp:', '').replace(/\s+/g, '');

    // Already has country code with +
    if (clean.startsWith('+')) return `whatsapp:${clean}`;

    // Nigerian number starting with 0
    if (clean.startsWith('0')) return `whatsapp:+234${clean.slice(1)}`;

    // Already has 234 without +
    if (clean.startsWith('234')) return `whatsapp:+${clean}`;

    // Fallback
    return `whatsapp:+${clean}`;
  }

  // ── SEND TEXT ─────────────────────────────────────────────────────
  async sendText(to: string, body: string): Promise<string> {
    try {
      const msg = await this.client.messages.create({
        from: this.fromNumber,
        to:   this.formatPhone(to),
        body,
      });
      logger.info(`[WhatsApp] Text sent to ${to} — SID: ${msg.sid}`);
      return msg.sid;
    } catch (err: any) {
      logger.error('[WhatsApp] Send text failed:', err.message);
      throw new AppError('WhatsApp message delivery failed', 500);
    }
  }

  // ── SEND TEMPLATE ─────────────────────────────────────────────────
  // Twilio uses Content Templates instead of Meta templates
  // For sandbox testing sendText works fine — templates needed for production
  async sendTemplate(msg: TemplateMessage): Promise<string> {
    try {
      // In Twilio sandbox — just send as plain text with the template name as context
      // In production replace this with Twilio Content API call
      const body = msg.variables?.length
        ? `${msg.templateName}: ${msg.variables.join(', ')}`
        : msg.templateName;

      const result = await this.client.messages.create({
        from: this.fromNumber,
        to:   this.formatPhone(msg.to),
        body,
      });

      logger.info(`[WhatsApp] Template "${msg.templateName}" sent to ${msg.to}`);
      return result.sid;
    } catch (err: any) {
      logger.error('[WhatsApp] Send template failed:', err.message);
      throw new AppError('WhatsApp template delivery failed', 500);
    }
  }

  // ── SEND MEDIA ────────────────────────────────────────────────────
  async sendMedia(msg: MediaMessage): Promise<string> {
    try {
      const result = await this.client.messages.create({
        from:      this.fromNumber,
        to:        this.formatPhone(msg.to),
        body:      msg.caption || '',
        mediaUrl:  [msg.mediaUrl],
      });
      logger.info(`[WhatsApp] ${msg.type} sent to ${msg.to}`);
      return result.sid;
    } catch (err: any) {
      logger.error('[WhatsApp] Send media failed:', err.message);
      throw new AppError('WhatsApp media delivery failed', 500);
    }
  }

  // ── SEND INTERACTIVE BUTTONS ──────────────────────────────────────
  // Twilio sandbox does not support native interactive buttons
  // We simulate them with numbered text options — same UX in chat
  async sendButtons(msg: InteractiveMessage): Promise<string> {
    try {
      if (!msg.buttons?.length) throw new AppError('Buttons required', 400);

      const buttonText = msg.buttons
        .map((b, i) => `${i + 1}️⃣ *${b.title}*`)
        .join('\n');

      const body =
        `${msg.body}\n\n` +
        `${buttonText}` +
        (msg.footer ? `\n\n_${msg.footer}_` : '');

      const result = await this.client.messages.create({
        from: this.fromNumber,
        to:   this.formatPhone(msg.to),
        body,
      });

      logger.info(`[WhatsApp] Buttons (text-simulated) sent to ${msg.to}`);
      return result.sid;
    } catch (err: any) {
      logger.error('[WhatsApp] Send buttons failed:', err.message);
      throw new AppError('WhatsApp interactive message failed', 500);
    }
  }

  // ── SEND LIST ─────────────────────────────────────────────────────
  // Simulated as numbered list in text — works in sandbox
  async sendList(msg: InteractiveMessage): Promise<string> {
    try {
      if (!msg.listSections?.length) throw new AppError('List sections required', 400);

      let listText = `${msg.body}\n\n`;

      let counter = 1;
      for (const section of msg.listSections) {
        if (section.title) listText += `*${section.title}*\n`;
        for (const row of section.rows) {
          listText += `${counter}. *${row.title}*`;
          if (row.description) listText += ` — ${row.description}`;
          listText += '\n';
          counter++;
        }
        listText += '\n';
      }

      listText += `_Reply with the number to select._`;
      if (msg.footer) listText += `\n\n_${msg.footer}_`;

      const result = await this.client.messages.create({
        from: this.fromNumber,
        to:   this.formatPhone(msg.to),
        body: listText,
      });

      logger.info(`[WhatsApp] List (text-simulated) sent to ${msg.to}`);
      return result.sid;
    } catch (err: any) {
      logger.error('[WhatsApp] Send list failed:', err.message);
      throw new AppError('WhatsApp list message failed', 500);
    }
  }

  // ── SEND LOCATION ─────────────────────────────────────────────────
  // Twilio does not support native location messages
  // Send as Google Maps link instead
  async sendLocation(msg: LocationMessage): Promise<string> {
    const mapsUrl = `https://maps.google.com/?q=${msg.latitude},${msg.longitude}`;
    const body    =
      `📍 *${msg.name || 'Location'}*\n` +
      (msg.address ? `${msg.address}\n` : '') +
      `\n${mapsUrl}`;

    return this.sendText(msg.to, body);
  }

  // ── MARK AS READ ──────────────────────────────────────────────────
  // Not supported in Twilio sandbox — no-op so nothing breaks
  async markAsRead(_messageId: string): Promise<void> {
    // Twilio sandbox does not support read receipts
    // This is intentionally a no-op
  }

  // ── GET MEDIA URL ─────────────────────────────────────────────────
  // Twilio sends MediaUrl0 directly in the webhook body
  async getMediaUrl(mediaIdOrUrl: string): Promise<string> {
    // In Twilio the media URL comes directly — just return it
    return mediaIdOrUrl;
  }

  // ── DOWNLOAD MEDIA BUFFER ─────────────────────────────────────────
  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    try {
      const axios  = require('axios');
      const res    = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        auth: {
          username: env.TWILIO_ACCOUNT_SID,
          password: env.TWILIO_AUTH_TOKEN,
        },
      });
      return Buffer.from(res.data);
    } catch (err: any) {
      logger.error('[WhatsApp] Download media failed:', err.message);
      throw new AppError('Media download failed', 500);
    }
  }

  // ── PARSE INCOMING TWILIO WEBHOOK ─────────────────────────────────
  parseIncomingMessage(body: Record<string, any>): IncomingWebhookMessage | null {
    try {
      if (!body?.From) return null;

      const message: IncomingWebhookMessage = {
        from:        body.From.replace('whatsapp:', ''), // strip prefix → plain number
        messageId:   body.MessageSid,
        type:        body.MediaUrl0 ? 'image' : 'text',
        text:        body.Body || '',
        mediaUrl:    body.MediaUrl0,
        mediaId:     body.MediaUrl0,   // Twilio sends URL not ID
        profileName: body.ProfileName,
        timestamp:   Math.floor(Date.now() / 1000),
      };

      return message;
    } catch (err) {
      logger.error('[WhatsApp] Parse webhook failed:', err);
      return null;
    }
  }

  // ── VERIFY TWILIO WEBHOOK SIGNATURE ───────────────────────────────
  verifyWebhookSignature(
    url:       string,
    params:    Record<string, string>,
    signature: string
  ): boolean {
    try {
      return twilio.validateRequest(
        env.TWILIO_AUTH_TOKEN,
        signature,
        url,
        params
      );
    } catch (err) {
      logger.error('[WhatsApp] Signature validation error:', err);
      return false;
    }
  }

  // ── VERIFY WEBHOOK CHALLENGE ───────────────────────────────────────
  // Twilio does not use GET challenge — kept as no-op for compatibility
  verifyWebhookChallenge(
    _mode:      string,
    _token:     string,
    _challenge: string
  ): string | null {
    // Twilio does not require a webhook challenge verification
    // Meta/WhatsApp Cloud API needs this — Twilio does not
    return null;
  }

  // ════════════════════════════════════════════════════════════════════
  //  HIGH-LEVEL HELPERS — identical signatures to before
  // ════════════════════════════════════════════════════════════════════

  // ── SEND OTP ──────────────────────────────────────────────────────
  async sendOTP(
    to:   string,
    otp:  string,
    type: 'register' | 'login' | 'reset' = 'register'
  ): Promise<void> {
    const messages = {
      register:
        `🌾 *AgroFinPay*\n\n` +
        `Your verification code is:\n\n` +
        `*${otp}*\n\n` +
        `Expires in 5 minutes. Do not share this code with anyone.`,
      login:
        `🔐 *AgroFinPay Login*\n\n` +
        `Your one-time login code is:\n\n` +
        `*${otp}*\n\n` +
        `Expires in 5 minutes.`,
      reset:
        `🔑 *AgroFinPay*\n\n` +
        `Your password reset code is:\n\n` +
        `*${otp}*\n\n` +
        `Expires in 5 minutes.`,
    };
    await this.sendText(to, messages[type]);
  }

  // ── SEND WELCOME ──────────────────────────────────────────────────
  async sendWelcome(to: string, firstName: string): Promise<void> {
    await this.sendText(
      to,
      `👋 Welcome to *AgroFinPay*, ${firstName}! 🌾\n\n` +
      `Nigeria's #1 WhatsApp-first fintech & agro marketplace.\n\n` +
      `Here's what you can do:\n` +
      `💸 *TRANSFER* — Send money\n` +
      `💰 *BALANCE* — Check wallet\n` +
      `💳 *DEPOSIT* — Fund your wallet\n` +
      `🏦 *WITHDRAW* — Cash out to bank\n` +
      `🌾 *BUY* — Shop for agro products\n` +
      `💳 *CARD* — Virtual dollar card\n` +
      `🪙 *CRYPTO* — Buy & swap crypto\n` +
      `🏢 *BUSINESS* — Business account\n` +
      `🆘 *HELP* — Talk to support\n\n` +
      `Reply with any command to get started! 🚀`
    );
  }

  // ── SEND TRANSFER CONFIRMATION ────────────────────────────────────
  async sendTransferConfirmation(to: string, data: {
    recipientName:  string;
    recipientPhone: string;
    amount:         number;
    reference:      string;
  }): Promise<void> {
    // Use simulated buttons since Twilio sandbox has no native buttons
    await this.sendButtons({
      to,
      body:
        `💸 *Confirm Transfer*\n\n` +
        `Send *₦${data.amount.toLocaleString()}* to:\n` +
        `👤 ${data.recipientName}\n` +
        `📱 ${data.recipientPhone}\n\n` +
        `Ref: ${data.reference}`,
      footer: 'This action cannot be undone',
      buttons: [
        { id: `CONFIRM_TXN_${data.reference}`, title: 'YES — Confirm' },
        { id: `CANCEL_TXN_${data.reference}`,  title: 'NO — Cancel'  },
      ],
    });
  }

  // ── SEND ORDER UPDATE ─────────────────────────────────────────────
  async sendOrderUpdate(to: string, data: {
    reference: string;
    status:    string;
    message:   string;
  }): Promise<void> {
    const statusEmoji: Record<string, string> = {
      CONFIRMED:   '✅',
      DISPATCHED:  '🚚',
      IN_TRANSIT:  '📍',
      DELIVERED:   '🎉',
      CANCELLED:   '❌',
    };
    await this.sendText(
      to,
      `${statusEmoji[data.status] || '📦'} *Order Update*\n\n` +
      `Order: *${data.reference}*\n` +
      `Status: *${data.status}*\n\n` +
      `${data.message}`
    );
  }

  // ── SEND KYC UPDATE ───────────────────────────────────────────────
  async sendKYCUpdate(
    to:      string,
    status:  'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUIRED',
    reason?: string
  ): Promise<void> {
    const messages = {
      APPROVED:
        `🎉 *KYC Approved!*\n\n` +
        `Your identity has been verified. You now have full access:\n` +
        `✅ ₦2,000,000 daily transfer limit\n` +
        `✅ Virtual dollar card\n` +
        `✅ Crypto trading\n\n` +
        `Reply *MENU* to get started.`,
      REJECTED:
        `❌ *KYC Rejected*\n\n` +
        `Your KYC submission was rejected.\n\n` +
        `*Reason:* ${reason || 'Documents could not be verified.'}\n\n` +
        `Reply *KYC* to resubmit.`,
      RESUBMISSION_REQUIRED:
        `⚠️ *Additional Info Required*\n\n` +
        `${reason || 'Please resubmit your KYC documents.'}\n\n` +
        `Reply *KYC* to resubmit.`,
    };
    await this.sendText(to, messages[status]);
  }

  // ── SEND PRODUCT LIST ─────────────────────────────────────────────
  async sendProductList(
    to:       string,
    products: { id: string; name: string; price: number; unit: string }[]
  ): Promise<void> {
    await this.sendList({
      to,
      body:      `🌾 *Available Products*\n\nSelect a product to place an order.`,
      footer:    'Powered by AgroFinPay Marketplace',
      listTitle: 'Browse Products',
      listSections: [{
        title: 'Products',
        rows:  products.slice(0, 10).map(p => ({
          id:          `PRODUCT_${p.id}`,
          title:       p.name.slice(0, 24),
          description: `₦${p.price.toLocaleString()} per ${p.unit}`,
        })),
      }],
    });
  }

  // ── SEND ESCALATION NOTICE ────────────────────────────────────────
  async sendEscalationNotice(to: string, agentName?: string): Promise<void> {
    await this.sendText(
      to,
      `👤 *Connecting to Support*\n\n` +
      (agentName
        ? `You are being connected to *${agentName}*, one of our support agents.`
        : `A support agent will be with you shortly.`) +
      `\n\nPlease continue describing your issue here while you wait.`
    );
  }
}

export const whatsAppService = new WhatsAppService();


// import axios, { AxiosInstance } from 'axios';
// import { env } from '../config/env';
// import { AppError } from '../core/errors/AppError';
// import { logger } from '../shared/utils/logger';
// import crypto from 'crypto';

// // ── TYPES ─────────────────────────────────────────────────────────────────────
// export interface TextMessage {
//   to: string;
//   body: string;
// }

// export interface TemplateMessage {
//   to: string;
//   templateName: string;
//   languageCode?: string;
//   components?: TemplateComponent[];
// }

// export interface TemplateComponent {
//   type: 'header' | 'body' | 'button';
//   parameters: TemplateParameter[];
// }

// export interface TemplateParameter {
//   type: 'text' | 'currency' | 'date_time' | 'image' | 'document';
//   text?: string;
//   currency?: { fallback_value: string; code: string; amount_1000: number };
//   image?: { link: string };
//   document?: { link: string; filename: string };
// }

// export interface MediaMessage {
//   to: string;
//   type: 'image' | 'document' | 'audio' | 'video';
//   mediaUrl: string;
//   caption?: string;
//   filename?: string;
// }

// export interface InteractiveMessage {
//   to: string;
//   body: string;
//   footer?: string;
//   buttons?: { id: string; title: string }[];
//   listTitle?: string;
//   listSections?: {
//     title: string;
//     rows: { id: string; title: string; description?: string }[];
//   }[];
// }

// export interface LocationMessage {
//   to: string;
//   latitude: number;
//   longitude: number;
//   name?: string;
//   address?: string;
// }

// export interface IncomingWebhookMessage {
//   from: string;
//   messageId: string;
//   type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'interactive' | 'sticker';
//   text?: string;
//   mediaId?: string;
//   mediaUrl?: string;
//   caption?: string;
//   interactiveReply?: { type: 'button_reply' | 'list_reply'; id: string; title: string };
//   location?: { latitude: number; longitude: number; name?: string; address?: string };
//   timestamp: number;
//   profileName?: string;
// }

// // ── SERVICE ───────────────────────────────────────────────────────────────────
// class WhatsAppCloudService {
//   private client: AxiosInstance;
//   private phoneNumberId: string;
//   private apiVersion: string = 'v19.0';

//   constructor() {
//     const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
//     if (!phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID is not defined');
//     this.phoneNumberId = phoneNumberId;

//     this.client = axios.create({
//       baseURL: `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`,
//       headers: {
//         Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
//         'Content-Type': 'application/json',
//       },
//       timeout: 15000,
//     });
//   }

//   // ── FORMAT NUMBER ─────────────────────────────────────────
//   private formatPhone(phone: string): string {
//     // Strip leading 0 and add Nigeria country code if needed
//     let clean = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
//     if (clean.startsWith('0')) clean = `234${clean.slice(1)}`;
//     if (clean.startsWith('+')) clean = clean.slice(1);
//     return clean;
//   }

//   // ── SEND TEXT ─────────────────────────────────────────────
//   async sendText(to: string, body: string): Promise<string> {
//     try {
//       const res = await this.client.post('/messages', {
//         messaging_product: 'whatsapp',
//         recipient_type:    'individual',
//         to:                this.formatPhone(to),
//         type:              'text',
//         text: {
//           preview_url: false,
//           body,
//         },
//       });

//       const messageId = res.data.messages?.[0]?.id;
//       logger.info(`[WhatsApp] Text sent to ${to} — msgId: ${messageId}`);
//       return messageId;
//     } catch (err: any) {
//       logger.error('[WhatsApp] Send text failed:', err.response?.data || err.message);
//       throw new AppError('WhatsApp message delivery failed', 500);
//     }
//   }

//   // ── SEND TEMPLATE ─────────────────────────────────────────
//   async sendTemplate(msg: TemplateMessage): Promise<string> {
//     try {
//       const res = await this.client.post('/messages', {
//         messaging_product: 'whatsapp',
//         to:                this.formatPhone(msg.to),
//         type:              'template',
//         template: {
//           name:     msg.templateName,
//           language: { code: msg.languageCode || 'en_US' },
//           components: msg.components || [],
//         },
//       });

//       const messageId = res.data.messages?.[0]?.id;
//       logger.info(`[WhatsApp] Template "${msg.templateName}" sent to ${msg.to}`);
//       return messageId;
//     } catch (err: any) {
//       logger.error('[WhatsApp] Send template failed:', err.response?.data || err.message);
//       throw new AppError('WhatsApp template delivery failed', 500);
//     }
//   }

//   // ── SEND MEDIA ────────────────────────────────────────────
//   async sendMedia(msg: MediaMessage): Promise<string> {
//     try {
//       const mediaPayload: any = { link: msg.mediaUrl };
//       if (msg.caption)  mediaPayload.caption  = msg.caption;
//       if (msg.filename) mediaPayload.filename = msg.filename;

//       const res = await this.client.post('/messages', {
//         messaging_product: 'whatsapp',
//         recipient_type:    'individual',
//         to:                this.formatPhone(msg.to),
//         type:              msg.type,
//         [msg.type]:        mediaPayload,
//       });

//       const messageId = res.data.messages?.[0]?.id;
//       logger.info(`[WhatsApp] ${msg.type} sent to ${msg.to}`);
//       return messageId;
//     } catch (err: any) {
//       logger.error('[WhatsApp] Send media failed:', err.response?.data || err.message);
//       throw new AppError('WhatsApp media delivery failed', 500);
//     }
//   }

//   // ── SEND INTERACTIVE BUTTONS ──────────────────────────────
//   async sendButtons(msg: InteractiveMessage): Promise<string> {
//     try {
//       if (!msg.buttons?.length) throw new AppError('Buttons required', 400);

//       const res = await this.client.post('/messages', {
//         messaging_product: 'whatsapp',
//         recipient_type:    'individual',
//         to:                this.formatPhone(msg.to),
//         type:              'interactive',
//         interactive: {
//           type: 'button',
//           body: { text: msg.body },
//           ...(msg.footer && { footer: { text: msg.footer } }),
//           action: {
//             buttons: msg.buttons.map(b => ({
//               type:  'reply',
//               reply: { id: b.id, title: b.title.slice(0, 20) },
//             })),
//           },
//         },
//       });

//       const messageId = res.data.messages?.[0]?.id;
//       logger.info(`[WhatsApp] Buttons sent to ${msg.to}`);
//       return messageId;
//     } catch (err: any) {
//       logger.error('[WhatsApp] Send buttons failed:', err.response?.data || err.message);
//       throw new AppError('WhatsApp interactive message failed', 500);
//     }
//   }

//   // ── SEND LIST ─────────────────────────────────────────────
//   async sendList(msg: InteractiveMessage): Promise<string> {
//     try {
//       if (!msg.listSections?.length) throw new AppError('List sections required', 400);

//       const res = await this.client.post('/messages', {
//         messaging_product: 'whatsapp',
//         recipient_type:    'individual',
//         to:                this.formatPhone(msg.to),
//         type:              'interactive',
//         interactive: {
//           type: 'list',
//           body: { text: msg.body },
//           ...(msg.footer && { footer: { text: msg.footer } }),
//           action: {
//             button:   msg.listTitle || 'Select',
//             sections: msg.listSections,
//           },
//         },
//       });

//       const messageId = res.data.messages?.[0]?.id;
//       logger.info(`[WhatsApp] List sent to ${msg.to}`);
//       return messageId;
//     } catch (err: any) {
//       logger.error('[WhatsApp] Send list failed:', err.response?.data || err.message);
//       throw new AppError('WhatsApp list message failed', 500);
//     }
//   }

//   // ── SEND LOCATION ─────────────────────────────────────────
//   async sendLocation(msg: LocationMessage): Promise<string> {
//     try {
//       const res = await this.client.post('/messages', {
//         messaging_product: 'whatsapp',
//         to:                this.formatPhone(msg.to),
//         type:              'location',
//         location: {
//           latitude:  msg.latitude,
//           longitude: msg.longitude,
//           name:      msg.name,
//           address:   msg.address,
//         },
//       });
//       return res.data.messages?.[0]?.id;
//     } catch (err: any) {
//       logger.error('[WhatsApp] Send location failed:', err.response?.data || err.message);
//       throw new AppError('WhatsApp location message failed', 500);
//     }
//   }

//   // ── MARK AS READ ──────────────────────────────────────────
//   async markAsRead(messageId: string): Promise<void> {
//     try {
//       await this.client.post('/messages', {
//         messaging_product: 'whatsapp',
//         status:            'read',
//         message_id:        messageId,
//       });
//     } catch (err: any) {
//       logger.warn('[WhatsApp] Mark as read failed:', err.response?.data || err.message);
//     }
//   }

//   // ── DOWNLOAD MEDIA ────────────────────────────────────────
//   async getMediaUrl(mediaId: string): Promise<string> {
//     try {
//       const res = await axios.get(
//         `https://graph.facebook.com/${this.apiVersion}/${mediaId}`,
//         { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } }
//       );
//       return res.data.url;
//     } catch (err: any) {
//       logger.error('[WhatsApp] Get media URL failed:', err.response?.data || err.message);
//       throw new AppError('Could not retrieve media URL', 500);
//     }
//   }

//   // ── DOWNLOAD MEDIA BUFFER ─────────────────────────────────
//   async downloadMedia(mediaId: string): Promise<Buffer> {
//     try {
//       const mediaUrl = await this.getMediaUrl(mediaId);
//       const res = await axios.get(mediaUrl, {
//         responseType: 'arraybuffer',
//         headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
//       });
//       return Buffer.from(res.data);
//     } catch (err: any) {
//       logger.error('[WhatsApp] Download media failed:', err.message);
//       throw new AppError('Media download failed', 500);
//     }
//   }

//   // ── PARSE INCOMING WEBHOOK ────────────────────────────────
//   parseIncomingMessage(body: any): IncomingWebhookMessage | null {
//     try {
//       const entry   = body?.entry?.[0];
//       const changes = entry?.changes?.[0];
//       const value   = changes?.value;
//       const msg     = value?.messages?.[0];
//       const contact = value?.contacts?.[0];

//       if (!msg) return null;

//       const base: IncomingWebhookMessage = {
//         from:        msg.from,
//         messageId:   msg.id,
//         type:        msg.type,
//         timestamp:   parseInt(msg.timestamp),
//         profileName: contact?.profile?.name,
//       };

//       switch (msg.type) {
//         case 'text':
//           base.text = msg.text?.body;
//           break;

//         case 'image':
//         case 'document':
//         case 'audio':
//         case 'video':
//         case 'sticker':
//           base.mediaId  = msg[msg.type]?.id;
//           base.caption  = msg[msg.type]?.caption;
//           (base as any).filename = msg[msg.type]?.filename;
//           break;

//         case 'interactive':
//           if (msg.interactive?.type === 'button_reply') {
//             base.interactiveReply = {
//               type:  'button_reply',
//               id:    msg.interactive.button_reply.id,
//               title: msg.interactive.button_reply.title,
//             };
//             base.text = msg.interactive.button_reply.title;
//           } else if (msg.interactive?.type === 'list_reply') {
//             base.interactiveReply = {
//               type:  'list_reply',
//               id:    msg.interactive.list_reply.id,
//               title: msg.interactive.list_reply.title,
//             };
//             base.text = msg.interactive.list_reply.title;
//           }
//           break;

//         case 'location':
//           base.location = {
//             latitude:  msg.location?.latitude,
//             longitude: msg.location?.longitude,
//             name:      msg.location?.name,
//             address:   msg.location?.address,
//           };
//           break;
//       }

//       return base;
//     } catch (err) {
//       logger.error('[WhatsApp] Parse webhook failed:', err);
//       return null;
//     }
//   }

//   // ── VERIFY WEBHOOK SIGNATURE ──────────────────────────────
//   verifyWebhookSignature(payload: string, signature: string): boolean {
//     try {
//       if (!env.WHATSAPP_APP_SECRET) {
//         return false;
//       }
//       const expected = crypto
//         .createHmac('sha256', env.WHATSAPP_APP_SECRET)
//         .update(payload)
//         .digest('hex');
//       return `sha256=${expected}` === signature;
//     } catch {
//       return false;
//     }
//   }

//   // ── VERIFY WEBHOOK CHALLENGE (initial setup) ──────────────
//   verifyWebhookChallenge(
//     mode: string,
//     token: string,
//     challenge: string
//   ): string | null {
//     if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
//       logger.info('[WhatsApp] Webhook verified successfully');
//       return challenge;
//     }
//     logger.warn('[WhatsApp] Webhook verification failed');
//     return null;
//   }

//   // ── HIGH-LEVEL HELPERS ────────────────────────────────────

//   // OTP message
//   async sendOTP(to: string, otp: string, type: 'register' | 'login' | 'reset' = 'register'): Promise<void> {
//     const messages = {
//       register: `🌾 *AgroFinPay*\n\nYour verification code is:\n\n*${otp}*\n\nExpires in 5 minutes. Do not share this code with anyone.`,
//       login:    `🔐 *AgroFinPay Login*\n\nYour one-time login code is:\n\n*${otp}*\n\nExpires in 5 minutes.`,
//       reset:    `🔑 *AgroFinPay*\n\nYour password reset code is:\n\n*${otp}*\n\nExpires in 5 minutes.`,
//     };
//     await this.sendText(to, messages[type]);
//   }

//   // Transfer confirmation prompt
//   async sendTransferConfirmation(to: string, data: {
//     recipientName: string;
//     recipientPhone: string;
//     amount: number;
//     reference: string;
//   }): Promise<void> {
//     await this.sendButtons({
//       to,
//       body: `💸 *Confirm Transfer*\n\nSend *₦${data.amount.toLocaleString()}* to:\n👤 ${data.recipientName}\n📱 ${data.recipientPhone}\n\nRef: ${data.reference}`,
//       footer: 'This action cannot be undone',
//       buttons: [
//         { id: `CONFIRM_TXN_${data.reference}`, title: '✅ Confirm' },
//         { id: `CANCEL_TXN_${data.reference}`,  title: '❌ Cancel'  },
//       ],
//     });
//   }

//   // Welcome message
//   async sendWelcome(to: string, firstName: string): Promise<void> {
//     await this.sendText(to,
//       `👋 Welcome to *AgroFinPay*, ${firstName}!\n\n` +
//       `🌾 Nigeria's #1 WhatsApp-first fintech & agro marketplace.\n\n` +
//       `Here's what you can do:\n` +
//       `💸 *TRANSFER* — Send money\n` +
//       `💰 *BALANCE* — Check wallet\n` +
//       `🌾 *BUY* — Shop for agro products\n` +
//       `💳 *CARD* — Virtual dollar card\n` +
//       `🪙 *CRYPTO* — Buy & swap crypto\n` +
//       `🏢 *BUSINESS* — Business account\n` +
//       `🆘 *HELP* — Talk to support\n\n` +
//       `Reply with any of the commands above to get started! 🚀`
//     );
//   }

//   // Order status update
//   async sendOrderUpdate(to: string, data: {
//     reference: string;
//     status: string;
//     message: string;
//   }): Promise<void> {
//     const statusEmoji: Record<string, string> = {
//       CONFIRMED:   '✅',
//       DISPATCHED:  '🚚',
//       IN_TRANSIT:  '📍',
//       DELIVERED:   '🎉',
//       CANCELLED:   '❌',
//     };
//     const emoji = statusEmoji[data.status] || '📦';
//     await this.sendText(to,
//       `${emoji} *Order Update*\n\nOrder: *${data.reference}*\nStatus: *${data.status}*\n\n${data.message}`
//     );
//   }

//   // KYC status update
//   async sendKYCUpdate(to: string, status: 'APPROVED' | 'REJECTED' | 'RESUBMISSION_REQUIRED', reason?: string): Promise<void> {
//     const messages = {
//       APPROVED: `🎉 *KYC Approved!*\n\nYour identity has been verified. You now have full access to AgroFinPay including:\n✅ ₦2,000,000 daily transfer limit\n✅ Virtual dollar card\n✅ Crypto trading\n\nReply *MENU* to get started.`,
//       REJECTED: `❌ *KYC Rejected*\n\nUnfortunately, your KYC submission was rejected.\n\n*Reason:* ${reason || 'Documents could not be verified.'}\n\nReply *KYC* to resubmit.`,
//       RESUBMISSION_REQUIRED: `⚠️ *Additional Info Required*\n\n${reason || 'Please resubmit your KYC documents.'}\n\nReply *KYC* to resubmit.`,
//     };
//     await this.sendText(to, messages[status]);
//   }

//   // Product listing menu (interactive list)
//   async sendProductList(to: string, products: { id: string; name: string; price: number; unit: string }[]): Promise<void> {
//     await this.sendList({
//       to,
//       body:      `🌾 *Available Products*\n\nSelect a product to see more details and place an order.`,
//       footer:    'Powered by AgroFinPay Marketplace',
//       listTitle: 'Browse Products',
//       listSections: [{
//         title: 'Products',
//         rows:  products.slice(0, 10).map(p => ({
//           id:          `PRODUCT_${p.id}`,
//           title:       p.name.slice(0, 24),
//           description: `₦${p.price.toLocaleString()} per ${p.unit}`,
//         })),
//       }],
//     });
//   }

//   // Support escalation notice
//   async sendEscalationNotice(to: string, agentName?: string): Promise<void> {
//     await this.sendText(to,
//       `👤 *Connecting to Support*\n\n` +
//       (agentName
//         ? `You're being connected to *${agentName}*, one of our support agents.`
//         : `A support agent will be with you shortly.`) +
//       `\n\nPlease continue describing your issue here while you wait.`
//     );
//   }
// }

// export const whatsAppService = new WhatsAppCloudService();