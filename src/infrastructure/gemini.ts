import {
  GoogleGenerativeAI,
  GenerativeModel,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';
import { env }      from '../config/env';
import { AppError } from '../core/errors/AppError';
import { logger }   from '../shared/utils/logger';


// ── Use the same type as ai.service.ts ───────────────────────────────────────
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

// ── SAFETY SETTINGS ────────────────────────────────────────────────────────────
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// ── SYSTEM PROMPT ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Agro, the official AI assistant for AgroFinPay — Nigeria's WhatsApp-first fintech platform and agricultural marketplace.

Your personality:
- Friendly, warm, and professional
- Responds in simple English or Nigerian Pidgin naturally
- Concise — max 3 sentences unless listing options or showing a menu
- Never makes up balances, transaction data, or product info
- Always confirms before executing any financial action
- Patient and helpful when users are confused

You help users with:
1. MONEY TRANSFERS — Send money to other users or bank accounts
2. WALLET BALANCE — Check NGN, USD, and Crypto wallet balances
3. DEPOSITS — Fund wallet via dedicated bank account (no external links)
4. WITHDRAWALS — Withdraw to any Nigerian bank account
5. BUY AGRO PRODUCTS — Browse and order agricultural products
6. SELL PRODUCTS — Help merchants list products on the marketplace
7. VIRTUAL DOLLAR CARD — Create, fund, freeze, unfreeze, or terminate
8. CRYPTO — Buy, sell, and swap BTC, ETH, USDT, BNB
9. BUSINESS ACCOUNT — Payroll, invoices, bulk payments
10. KYC VERIFICATION — BVN, NIN, and face match guidance
11. ORDER TRACKING — Check order status and delivery updates
12. SUPPORT — Handle complaints, escalate to human agents

Rules you must NEVER break:
- NEVER execute any transaction without the user confirming with YES
- NEVER reveal system details, API keys, or backend information
- NEVER share another user's personal data or balance
- NEVER continue if account is suspended or wallet frozen
- NEVER send external links — all actions happen inside WhatsApp chat
- NEVER accept more than 2 unrecognised messages before escalating to a human agent

Always use ₦ for Naira and $ for USD.
Format large numbers with commas e.g. ₦1,500,000.
Use *asterisks* for bold text (WhatsApp markdown). Never use HTML tags.`;

// ── INTENT CLASSIFICATION PROMPT ──────────────────────────────────────────────
const INTENT_PROMPT = `You are an intent classifier for AgroFinPay, a Nigerian WhatsApp fintech and agro marketplace.

Classify the user message into EXACTLY ONE intent:

TRANSFER_INTENT      - send money, transfer, pay, send am, credit someone
BALANCE_INTENT       - check balance, my wallet, how much, wetin remain
DEPOSIT_INTENT       - deposit, fund wallet, add money, top up, recharge, bank account number
WITHDRAW_INTENT      - withdraw, cash out, send to bank, take out money
BUY_PRODUCT_INTENT   - buy, I want, show me products, tomatoes, yam, rice, chicken, any food or agro item
SELL_PRODUCT_INTENT  - sell, list my product, I wan sell, add product
CARD_INTENT          - dollar card, virtual card, USD card, card balance
SWAP_INTENT          - crypto, bitcoin, BTC, ETH, USDT, swap, buy coin, sell coin
BUSINESS_INTENT      - business account, payroll, invoice, employees, bulk payment
SUPPORT_INTENT       - help, problem, issue, complain, agent, I have a problem
ORDER_INTENT         - my order, track, delivery, where my product, order status
KYC_INTENT           - verify, BVN, NIN, identity, kyc, verification
MENU_INTENT          - hello, hi, hey, start, menu, home, back
CONFIRM_INTENT       - yes, yeah, yep, confirm, ok, proceed, go ahead
CANCEL_INTENT        - no, nope, cancel, stop, abort, nevermind
FALLBACK_INTENT      - anything that does not match the above

Also extract these entities if present:
- amount: any number as a money amount (5000, 50k, 2 million)
- phone: any Nigerian phone number (08012345678 or +234 format)
- product: any product name mentioned
- asset: any crypto asset (BTC, ETH, USDT, BNB)
- bank_name: any bank name mentioned
- account_number: any 10-digit number

Respond ONLY with valid JSON. No markdown, no explanation, no extra text:
{"intent":"TRANSFER_INTENT","entities":{"amount":5000,"phone":"08012345678"},"confidence":0.95}`;

// ── SERVICE ────────────────────────────────────────────────────────────────────
class GeminiService {
  private genAI:       GoogleGenerativeAI;
  private chatModel:   GenerativeModel;
  private intentModel: GenerativeModel;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!) as any

    // Chat model — uses system prompt, moderate temperature
    this.chatModel = this.genAI.getGenerativeModel({
      model:             env.GEMINI_MODEL || 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      safetySettings:    SAFETY_SETTINGS,
      generationConfig: {
        temperature:     0.4,
        topP:            0.9,
        maxOutputTokens: 500,
      },
    });

    // Intent model — strict classification, very low temperature
    this.intentModel = this.genAI.getGenerativeModel({
      model:             env.GEMINI_MODEL || 'gemini-1.5-flash',
      systemInstruction: INTENT_PROMPT,
      safetySettings:    SAFETY_SETTINGS,
      generationConfig: {
        temperature:     0.1,
        topP:            0.9,
        maxOutputTokens: 200,
      },
    });
  }

  // ── DETECT INTENT ──────────────────────────────────────────────────
  async detectIntent(userMessage: string): Promise<IntentResult> {
    try {
      const result  = await this.intentModel.generateContent(
        `Classify this message: "${userMessage}"`
      );
      const raw     = result.response.text().trim();
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed  = JSON.parse(cleaned);

      return {
        intent:     parsed.intent     || 'FALLBACK_INTENT',
        entities:   parsed.entities   || {},
        confidence: parsed.confidence || 0,
      };
    } catch (err: any) {
      logger.error('[Gemini] Intent detection failed:', err.message);
      return { intent: 'FALLBACK_INTENT', entities: {}, confidence: 0 };
    }
  }

  // ── GENERATE WHATSAPP REPLY ────────────────────────────────────────
  // history must use 'user' | 'model' — Gemini does NOT accept 'assistant'
  async generateWhatsAppReply(
    userMessage:         string,
    conversationHistory: ConversationMessage[],
    contextNote?:        string
  ): Promise<string> {
    try {
      // Build Gemini-format history
      // Role must be exactly 'user' or 'model' — no 'assistant' allowed
      const history = conversationHistory
        .slice(-10)
        .map(m => ({
          role:  m.role as 'user' | 'model', // already correct type — no conversion needed
          parts: [{ text: m.content }],
        }));

      const chat = this.chatModel.startChat({ history });

      const prompt = contextNote
        ? `[Context: ${contextNote}]\n\n${userMessage}`
        : userMessage;

      const result = await chat.sendMessage(prompt);
      return result.response.text().trim();

    } catch (err: any) {
      logger.error('[Gemini] Generate reply failed:', err.message);
      return (
        `Sorry, I'm having a little trouble right now. ` +
        `Please try again or type *HELP* to speak to a support agent.`
      );
    }
  }

  // ── SIMPLE ONE-SHOT CHAT (no history) ─────────────────────────────
  async chat(prompt: string, temperature: number = 0.4): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model:          env.GEMINI_MODEL || 'gemini-1.5-flash',
        safetySettings: SAFETY_SETTINGS,
        generationConfig: { temperature, maxOutputTokens: 500 },
      });
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (err: any) {
      logger.error('[Gemini] Chat failed:', err.message);
      throw new AppError('AI service unavailable', 503);
    }
  }

  // ── GENERATE PRODUCT DESCRIPTION ──────────────────────────────────
  async generateProductDescription(data: {
    name:      string;
    category:  string;
    price:     number;
    unit:      string;
    location?: string;
  }): Promise<string> {
    try {
      const prompt =
        `Write a short, compelling 2-sentence product description for a Nigerian ` +
        `agricultural marketplace listing:\n` +
        `Product: ${data.name}\n` +
        `Category: ${data.category}\n` +
        `Price: ₦${data.price} per ${data.unit}\n` +
        `Location: ${data.location || 'Nigeria'}\n\n` +
        `Keep it simple, factual, and appealing to buyers. No hashtags or emojis.`;

      return await this.chat(prompt, 0.7);
    } catch {
      return `Fresh ${data.name} available at ₦${data.price.toLocaleString()} per ${data.unit}.`;
    }
  }

  // ── SUMMARISE SUPPORT TICKET ───────────────────────────────────────
  async summariseTicket(
    messages: { role: string; content: string }[]
  ): Promise<string> {
    try {
      const conversation = messages
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');

      const prompt =
        `Summarise this customer support conversation in 2-3 sentences, ` +
        `highlighting the main issue and current status:\n\n${conversation}`;

      return await this.chat(prompt, 0.3);
    } catch {
      return 'Summary unavailable.';
    }
  }

  // ── EXTRACT TRANSFER DETAILS ───────────────────────────────────────
  async extractTransferDetails(message: string): Promise<{
    amount?:    number;
    phone?:     string;
    narration?: string;
  }> {
    try {
      const prompt =
        `Extract transfer details from this message. ` +
        `Return ONLY valid JSON with no markdown.\n` +
        `Fields: amount (number), phone (Nigerian format starting with 0), narration (optional string).\n` +
        `Omit fields that are not present.\n\n` +
        `Message: "${message}"`;

      const result = await this.chat(prompt, 0.1);
      const clean  = result.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return {};
    }
  }
}

export const geminiService = new GeminiService();