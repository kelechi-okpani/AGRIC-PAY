import OpenAI from 'openai';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';
import { AppError } from '../core/errors/AppError';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface IntentResult {
  intent: string;
  entities: Record<string, any>;
  confidence: number;
}

export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
}

class OpenAIService {

  // ── CHAT COMPLETION ───────────────────────────────────────
  async chat(messages: ChatMessage[], options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    try {
      const response = await client.chat.completions.create({
        model: options?.model || 'gpt-4o-mini',
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 500,
      });

      return response.choices[0]?.message?.content || '';
    } catch (err: any) {
      logger.error('[OpenAI] Chat completion failed:', err.message);
      throw new AppError('AI service unavailable', 503);
    }
  }

  // ── INTENT DETECTION ──────────────────────────────────────
  async detectIntent(userMessage: string): Promise<IntentResult> {
    const prompt = `You are an intent classifier for AgroFinPay, a Nigerian fintech and agricultural marketplace WhatsApp bot.

Classify the user message into ONE of these intents:
- TRANSFER_INTENT: send money, transfer, pay someone
- BALANCE_INTENT: check balance, my wallet, how much
- BUY_PRODUCT_INTENT: buy agro product, purchase, I want tomatoes/yam/rice etc
- SELL_PRODUCT_INTENT: list product, sell my products, I want to sell
- CARD_INTENT: dollar card, virtual card, USD card
- SWAP_INTENT: buy crypto, swap, USDT, bitcoin, BTC, ETH
- BUSINESS_INTENT: business account, payroll, invoice, employees
- SUPPORT_INTENT: help, problem, complaint, I have an issue
- ORDER_INTENT: my order, track delivery, where is my product
- FALLBACK_INTENT: none of the above

Extract relevant entities (amount, phone, product, asset etc).
Respond ONLY as valid JSON with no markdown:
{"intent": "...", "entities": {}, "confidence": 0.0}

User message: "${userMessage}"`;

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const raw = response.choices[0]?.message?.content || '{}';
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        intent: parsed.intent || 'FALLBACK_INTENT',
        entities: parsed.entities || {},
        confidence: parsed.confidence || 0,
      };
    } catch (err: any) {
      logger.error('[OpenAI] Intent detection failed:', err.message);
      return { intent: 'FALLBACK_INTENT', entities: {}, confidence: 0 };
    }
  }

  // ── GENERATE WHATSAPP RESPONSE ────────────────────────────
  async generateWhatsAppReply(
    userMessage: string,
    conversationHistory: ChatMessage[],
    contextNote?: string
  ): Promise<string> {
    const systemPrompt = `You are Agro, the friendly AI assistant for AgroFinPay — Nigeria's WhatsApp-first fintech and agricultural marketplace.

You help users:
- Send money and check wallet balances
- Buy and sell agricultural products (grains, vegetables, tubers, livestock etc)
- Manage virtual dollar cards
- Buy, sell and swap crypto
- Run business accounts and payroll
- Track orders and deliveries
- Get support

Rules:
- Always respond in simple English or Nigerian Pidgin
- Be concise — max 3 sentences unless listing options
- Be warm, helpful, and professional
- Never make up information about balances or transactions
- If unsure, offer to connect to a human agent
${contextNote ? `\nContext: ${contextNote}` : ''}`;

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-10),
        { role: 'user', content: userMessage },
      ];

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 300,
      });

      return response.choices[0]?.message?.content || "I didn't understand that. Type *HELP* to see what I can do.";
    } catch (err: any) {
      logger.error('[OpenAI] WhatsApp reply failed:', err.message);
      return "Sorry, I'm having trouble right now. Type *HELP* to speak to a human agent.";
    }
  }

  // ── SUMMARISE SUPPORT TICKET ──────────────────────────────
  async summariseTicket(messages: { role: string; content: string }[]): Promise<string> {
    const conversation = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Summarise this customer support conversation in 2-3 sentences, highlighting the main issue and current status:\n\n${conversation}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
      });

      return response.choices[0]?.message?.content || 'No summary available.';
    } catch (err: any) {
      logger.error('[OpenAI] Ticket summary failed:', err.message);
      return 'Summary unavailable.';
    }
  }

  // ── MODERATE CONTENT ──────────────────────────────────────
  async moderate(text: string): Promise<ModerationResult> {
    try {
      const response = await client.moderations.create({ input: text });
      const result = response.results[0];
      return {
        flagged: result.flagged,
        categories: result.categories as unknown as Record<string, boolean>,
      };
    } catch (err: any) {
      logger.error('[OpenAI] Moderation failed:', err.message);
      return { flagged: false, categories: {} };
    }
  }

  // ── GENERATE PRODUCT DESCRIPTION ──────────────────────────
  async generateProductDescription(data: {
    name: string;
    category: string;
    price: number;
    unit: string;
    location?: string;
  }): Promise<string> {
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Write a short, compelling product description (2 sentences) for a Nigerian agricultural marketplace listing:
Product: ${data.name}
Category: ${data.category}
Price: ₦${data.price} per ${data.unit}
Location: ${data.location || 'Nigeria'}

Keep it simple, factual, and appealing to buyers.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });

      return response.choices[0]?.message?.content || '';
    } catch (err: any) {
      logger.error('[OpenAI] Product description failed:', err.message);
      return '';
    }
  }

  // ── EXTRACT TRANSFER DETAILS FROM NATURAL LANGUAGE ────────
  async extractTransferDetails(message: string): Promise<{
    amount?: number;
    phone?: string;
    narration?: string;
  }> {
    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Extract transfer details from this message. Return only valid JSON with no markdown.
Fields: amount (number), phone (Nigerian format with 0 prefix), narration (optional string).
If a field is not present, omit it.

Message: "${message}"`,
          },
        ],
        temperature: 0.1,
        max_tokens: 100,
      });

      const raw = response.choices[0]?.message?.content || '{}';
      return JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      return {};
    }
  }
}

export const openaiService = new OpenAIService();