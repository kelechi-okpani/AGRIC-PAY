import OpenAI from 'openai';
import { env } from '../../config/env';
import { AIIntent } from '../../core/types/enums';
import redis from '../../config/redis';
import { logger } from '../../shared/utils/logger';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class AIService {

  async detectIntent(message: string): Promise<{ intent: AIIntent; entities: Record<string, any>; confidence: number }> {
    const prompt = `You are an intent classifier for AgroFinPay, a Nigerian fintech and agricultural marketplace WhatsApp bot.

Classify the user message into ONE of these intents:
- TRANSFER_INTENT: user wants to send money (e.g. "send 5000 to 08012345678", "transfer money")
- BALANCE_INTENT: user wants to check balance (e.g. "check balance", "my wallet", "how much I get")
- BUY_PRODUCT_INTENT: user wants to buy agro products (e.g. "buy tomatoes", "I want yam", "show me products")
- SELL_PRODUCT_INTENT: user wants to sell or list products (e.g. "list my product", "I want to sell")
- CARD_INTENT: user wants virtual card info (e.g. "dollar card", "virtual card", "USD card")
- SWAP_INTENT: user wants to swap or buy crypto (e.g. "buy USDT", "swap crypto", "bitcoin")
- BUSINESS_INTENT: user wants business account (e.g. "business account", "payroll", "invoice")
- SUPPORT_INTENT: user needs help (e.g. "help", "problem", "complaint", "I have issue")
- ORDER_INTENT: user wants to check their order (e.g. "my order", "track delivery", "where is my product")
- FALLBACK_INTENT: none of the above

Also extract relevant entities (amount, phone, product name, etc).

Respond ONLY as JSON: {"intent": "...", "entities": {}, "confidence": 0.0-1.0}

User message: "${message}"`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const raw = response.choices[0].message.content || '{}';
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      return { intent: parsed.intent || AIIntent.FALLBACK, entities: parsed.entities || {}, confidence: parsed.confidence || 0 };
    } catch (err) {
      logger.error('[AI] Intent detection failed:', err);
      return { intent: AIIntent.FALLBACK, entities: {}, confidence: 0 };
    }
  }

  async generateResponse(userId: string, userMessage: string, context?: string): Promise<string> {
    const history = await this.getConversationHistory(userId);

    const systemPrompt = `You are Agro, the friendly AI assistant for AgroFinPay — Nigeria's WhatsApp-first fintech and agricultural marketplace.

You help users:
- Send money and check balances
- Buy and sell agricultural products
- Manage virtual dollar cards
- Swap crypto
- Run business accounts
- Track orders and deliveries

Always respond in simple English or Nigerian Pidgin. Be concise (max 3 sentences). Be friendly and helpful.
${context ? `Current context: ${context}` : ''}`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10),
      { role: 'user', content: userMessage },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 300,
    });

    const reply = response.choices[0].message.content || "I didn't understand that. Please try again.";
    await this.saveToHistory(userId, userMessage, reply);
    return reply;
  }

  async getConversationHistory(userId: string): Promise<ConversationMessage[]> {
    const raw = await redis.get(`chat:history:${userId}`);
    return raw ? JSON.parse(raw) : [];
  }

  async saveToHistory(userId: string, userMessage: string, assistantReply: string): Promise<void> {
    const history = await this.getConversationHistory(userId);
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: assistantReply });

    const trimmed = history.slice(-20); // Keep last 20 messages
    await redis.set(`chat:history:${userId}`, JSON.stringify(trimmed), 'EX', 86400);
  }

  async clearHistory(userId: string): Promise<void> {
    await redis.del(`chat:history:${userId}`);
  }

  async setConversationState(userId: string, state: Record<string, any>): Promise<void> {
    await redis.set(`chat:state:${userId}`, JSON.stringify(state), 'EX', 3600);
  }

  async getConversationState(userId: string): Promise<Record<string, any> | null> {
    const raw = await redis.get(`chat:state:${userId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async clearConversationState(userId: string): Promise<void> {
    await redis.del(`chat:state:${userId}`);
  }
}

export const aiService = new AIService();