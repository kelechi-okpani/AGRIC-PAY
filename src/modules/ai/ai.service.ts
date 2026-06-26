import { geminiService } from '../../infrastructure/gemini';
import { AIIntent }      from '../../core/types/enums';
import redis             from '../../config/redis';
import { logger }        from '../../shared/utils/logger';

// ── Gemini uses 'user' | 'model' — NOT 'assistant' ───────────────────────────
export type MessageRole = 'user' | 'model';

export interface ConversationMessage {
  role:    MessageRole;
  content: string;
}

export interface IntentResult {
  intent:     string;
  entities:   Record<string, any>;
  confidence: number;
}

export class AIService {

  // ── DETECT INTENT ──────────────────────────────────────────────────
  async detectIntent(message: string): Promise<IntentResult> {
    if (!message?.trim()) {
      return { intent: AIIntent.FALLBACK, entities: {}, confidence: 0 };
    }
    return geminiService.detectIntent(message);
  }

  // ── GENERATE WHATSAPP RESPONSE ─────────────────────────────────────
  async generateResponse(
    userId:      string,
    userMessage: string,
    contextNote?: string
  ): Promise<string> {
    const history = await this.getConversationHistory(userId);
    const reply   = await geminiService.generateWhatsAppReply(
      userMessage,
      history,
      contextNote
    );
    await this.saveToHistory(userId, userMessage, reply);
    return reply;
  }

  // ── GET CONVERSATION HISTORY ───────────────────────────────────────
  async getConversationHistory(userId: string): Promise<ConversationMessage[]> {
    try {
      const raw = await redis.get(`chat:history:${userId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // ── SAVE TO HISTORY ────────────────────────────────────────────────
  async saveToHistory(
    userId:      string,
    userMessage: string,
    botReply:    string
  ): Promise<void> {
    try {
      const history = await this.getConversationHistory(userId);

      history.push({ role: 'user',  content: userMessage });
      history.push({ role: 'model', content: botReply    });

      // Keep last 20 messages (10 exchanges)
      const trimmed = history.slice(-20);

      await redis.set(
        `chat:history:${userId}`,
        JSON.stringify(trimmed),
        'EX',
        86400
      );
    } catch (err) {
      logger.error('[AI] Save history failed:', err);
    }
  }

  // ── CLEAR HISTORY ──────────────────────────────────────────────────
  async clearHistory(userId: string): Promise<void> {
    await redis.del(`chat:history:${userId}`);
  }

  // ── SET CONVERSATION STATE ─────────────────────────────────────────
  async setConversationState(
    userId: string,
    state:  Record<string, any>
  ): Promise<void> {
    await redis.set(
      `chat:state:${userId}`,
      JSON.stringify(state),
      'EX',
      3600
    );
  }

  // ── GET CONVERSATION STATE ─────────────────────────────────────────
  async getConversationState(
    userId: string
  ): Promise<Record<string, any> | null> {
    try {
      const raw = await redis.get(`chat:state:${userId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ── CLEAR CONVERSATION STATE ───────────────────────────────────────
  async clearConversationState(userId: string): Promise<void> {
    await redis.del(`chat:state:${userId}`);
  }

  // ── MERGE HISTORY FROM EXTERNAL SOURCE ────────────────────────────
  // Utility for importing history that may use 'assistant' role (OpenAI format)
  // and normalising it to Gemini format
  normaliseHistory(
    messages: { role: string; content: string }[]
  ): ConversationMessage[] {
    return messages.map(m => ({
      role:    m.role === 'assistant' ? 'model' : m.role === 'user' ? 'user' : 'model',
      content: m.content,
    })) as ConversationMessage[];
  }
}

export const aiService = new AIService();