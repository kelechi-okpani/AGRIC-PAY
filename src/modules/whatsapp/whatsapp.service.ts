import { whatsAppService } from '../../infrastructure/whatsapp';
import { aiService } from '../ai/ai.service';
import { AIIntent, WalletType } from '../../core/types/enums';
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
import { depositWithdrawalService } from '@modules/wallets/funding/deposit-withdrawal.service';
import { walletService } from '@modules/wallets/wallet.service';



export interface IncomingMessagePayload {
  from:              string;
  body:              string;
  mediaUrl?:         string;
  type?:             string;
  mediaId?:          string;
  location?:         { latitude: number; longitude: number; name?: string; address?: string };
  interactiveReply?: { type: string; id: string; title: string };
  profileName?:      string;
  messageId?:        string;
}

export class WhatsAppService {

  async handleIncomingMessage(data: IncomingMessagePayload): Promise<void> {
    const phone   = data.from.replace('whatsapp:', '');
    const message = data.interactiveReply?.title || data.body?.trim() || '';

    logger.info(`[WhatsApp] Incoming from ${phone}: "${message}"`);

    const user = await User.findOne({ phone });

    if (!user) {
      await whatsAppService.sendWelcome(phone, data.profileName || 'there');
      return;
    }

    if (!user.isVerified) {
      await whatsAppService.sendText(phone,
        `Please verify your account first. Reply *VERIFY* to resend your OTP.`
      );
      return;
    }

    if (user.isSuspended) {
      await whatsAppService.sendText(phone,
        `Your account has been suspended. Contact support: support@agrofinpay.ng`
      );
      return;
    }

    // Route escalated conversations to human agent
    const escalated = await redis.get(`support:escalated:${user._id}`);
    if (escalated) {
      await supportService.routeToAgent(user._id.toString(), message);
      return;
    }

    const retryKey   = `chat:retry:${user._id}`;
    const retryCount = parseInt((await redis.get(retryKey)) || '0');

    const { intent, entities, confidence } = await aiService.detectIntent(message);
    logger.info(`[WhatsApp] Intent: ${intent} (${confidence.toFixed(2)}) — user: ${user._id}`);

    let reply = '';

    try {
      switch (intent) {

       
        // ── DEPOSIT ────────────────────────────────────────────────────
        // case 'DEPOSIT_INTENT': {
        case AIIntent.DEPOSIT : {
          const state = await aiService.getConversationState(user._id.toString());

          if (!state?.depositStep) {
            await aiService.setConversationState(
              user._id.toString(),
              { depositStep: 'GET_AMOUNT' }
            );
            reply =
              `💰 *Fund Your Wallet*\n\n` +
              `How much do you want to deposit?\n\n` +
              `_(Reply with the amount e.g. *5000*, or reply *ANY* to get your account details without a specific amount)_`;
            break;
          }

          if (state.depositStep === 'GET_AMOUNT') {
            let amount: number | undefined;

            if (message.trim().toUpperCase() === 'ANY') {
              amount = undefined;
            } else {
              const clean = message.replace(/,/g, '').replace(/k$/i, '000').replace(/m$/i, '000000');
              const raw   = parseFloat(clean.replace(/[^0-9.]/g, ''));
              if (isNaN(raw) || raw < 100) {
                reply = `Please enter a valid amount (minimum ₦100), or reply *ANY* for your account details.`;
                break;
              }
              amount = raw;
            }

            await aiService.clearConversationState(user._id.toString());
            reply = await depositWithdrawalService.getDepositInstructions(
              user._id.toString(),
              amount
            );
            break;
          }

          reply = `Reply *DEPOSIT* to fund your wallet.`;
          break;
        }

      
        // ── WITHDRAW ───────────────────────────────────────────────────
        // case 'WITHDRAW_INTENT': {
         case AIIntent.WITHDRAW : { 
          const state = await aiService.getConversationState(user._id.toString());

          // Step 1 — Show balance, ask for amount
          if (!state?.withdrawStep) {
            const wallet = await walletService.getBalance(user._id.toString(), WalletType.NGN);
            await aiService.setConversationState(
              user._id.toString(),
              { withdrawStep: 'GET_AMOUNT' }
            );
            reply =
              `🏦 *Withdraw to Bank*\n\n` +
              `Your NGN balance: *₦${wallet.balance.toLocaleString()}*\n\n` +
              `How much do you want to withdraw? (minimum ₦100)\n\n` +
              `_Fees: ₦10 (≤₦5k) · ₦25 (≤₦50k) · ₦50 (≤₦200k) · ₦100 (above ₦200k)_`;
            break;
          }

          // Step 2 — Parse amount, check balance
          if (state.withdrawStep === 'GET_AMOUNT') {
            const clean = message.replace(/,/g, '').replace(/k$/i, '000').replace(/m$/i, '000000');
            const raw   = parseFloat(clean.replace(/[^0-9.]/g, ''));
            if (isNaN(raw) || raw < 100) {
              reply = `Please enter a valid amount (minimum ₦100).`;
              break;
            }

            const fee    = raw <= 5000 ? 10 : raw <= 50000 ? 25 : raw <= 200000 ? 50 : 100;
            const total  = raw + fee;
            const wallet = await walletService.getBalance(user._id.toString(), WalletType.NGN);

            if (wallet.balance < total) {
              await aiService.clearConversationState(user._id.toString());
              reply =
                `❌ *Insufficient Balance*\n\n` +
                `Required: *₦${total.toLocaleString()}* (₦${raw.toLocaleString()} + ₦${fee} fee)\n` +
                `Your balance: *₦${wallet.balance.toLocaleString()}*\n\n` +
                `Reply *DEPOSIT* to fund your wallet first.`;
              break;
            }

            await aiService.setConversationState(user._id.toString(), {
              withdrawStep: 'GET_BANK',
              amount: raw,
              fee,
              total,
            });
            reply =
              `Got it! *₦${raw.toLocaleString()}* (fee: ₦${fee})\n\n` +
              `Which bank are you withdrawing to?\n` +
              `_(e.g. *GTBank*, *Access*, *Zenith*, *First Bank*, *UBA*, *Kuda*, *Opay*)_`;
            break;
          }

          // Step 3 — Look up bank code from name
          if (state.withdrawStep === 'GET_BANK') {
            const bank = await depositWithdrawalService.findBankCode(message);
            if (!bank) {
              reply =
                `❌ Couldn't find a bank matching "*${message}*".\n\n` +
                `Please try the full bank name e.g. *Guaranty Trust Bank*, *Access Bank*, *Zenith Bank*.`;
              break;
            }
            await aiService.setConversationState(user._id.toString(), {
              ...state,
              withdrawStep: 'GET_ACCOUNT',
              bankCode:     bank.code,
              bankName:     bank.name,
            });
            reply = `What is your *10-digit ${bank.name} account number*?`;
            break;
          }

          // Step 4 — Verify account number with Paystack
          if (state.withdrawStep === 'GET_ACCOUNT') {
            const acctNum = message.replace(/\s/g, '');
            if (!/^\d{10}$/.test(acctNum)) {
              reply = `Please enter a valid *10-digit account number*. Try again.`;
              break;
            }

            let accountName: string;
            try {
              const resolved = await depositWithdrawalService.resolveBankAccount(
                acctNum,
                state.bankCode
              );
              accountName = resolved.accountName;
            } catch {
              reply =
                `❌ Could not verify account *${acctNum}* at *${state.bankName}*.\n\n` +
                `Please double-check the number, or reply *CANCEL* to stop.`;
              break;
            }

            await aiService.setConversationState(user._id.toString(), {
              ...state,
              withdrawStep:  'CONFIRM',
              accountNumber: acctNum,
              accountName,
            });
            reply =
              `Account verified ✅\n\n` +
              `Please confirm:\n\n` +
              `💸 Amount: *₦${state.amount.toLocaleString()}*\n` +
              `🏦 To: *${accountName}*\n` +
              `🏛 Bank: *${state.bankName}*\n` +
              `📋 Account: *${acctNum}*\n` +
              `💰 Fee: *₦${state.fee}*\n` +
              `💳 Total deducted: *₦${state.total.toLocaleString()}*\n\n` +
              `Reply *YES* to confirm or *NO* to cancel.`;
            break;
          }

          // Step 5 — Execute withdrawal
          if (state.withdrawStep === 'CONFIRM') {
            await aiService.clearConversationState(user._id.toString());

            if (['YES', 'Y', 'CONFIRM'].includes(message.trim().toUpperCase())) {
              try {
                await depositWithdrawalService.initiateWithdrawal(user._id.toString(), {
                  amount:        state.amount,
                  bankCode:      state.bankCode,
                  bankName:      state.bankName,
                  accountNumber: state.accountNumber,
                  accountName:   state.accountName,
                });
                // WhatsApp notification is sent inside initiateWithdrawal
                reply = '';
              } catch (err: any) {
                reply = `❌ *Withdrawal Failed*\n\n${err.message}`;
              }
            } else {
              reply =
                `Withdrawal cancelled. ✅\n\n` +
                `Your wallet balance is unchanged.\n\n` +
                `Reply *WITHDRAW* to try again or *MENU* to go back.`;
            }
            break;
          }

          reply = `Reply *WITHDRAW* to start a withdrawal.`;
          break;
        }

        // ── TRANSFER ───────────────────────────────────────────────────
        case AIIntent.TRANSFER:
          reply = await handleTransferIntent(user._id.toString(), entities, message);
          await redis.del(retryKey);
          break;

        // ── BALANCE ────────────────────────────────────────────────────
        case AIIntent.BALANCE:
          reply = await handleBalanceIntent(user._id.toString());
          await redis.del(retryKey);
          break;

        // ── BUY PRODUCT ────────────────────────────────────────────────
        case AIIntent.BUY_PRODUCT:
          reply = await handleBuyProductIntent(user._id.toString(), entities, message);
          await redis.del(retryKey);
          break;

        // ── VIRTUAL CARD ───────────────────────────────────────────────
        case AIIntent.CARD:
          reply = await handleCardIntent(user._id.toString(), entities, message);
          await redis.del(retryKey);
          break;

        // ── CRYPTO SWAP ────────────────────────────────────────────────
        case AIIntent.SWAP:
          reply = await handleSwapIntent(user._id.toString(), entities, message);
          await redis.del(retryKey);
          break;

        // ── SUPPORT ────────────────────────────────────────────────────
        case AIIntent.SUPPORT:
          reply = await handleSupportIntent(user._id.toString(), user.fullName, message);
          await redis.del(retryKey);
          break;

        // ── ORDER TRACKING ─────────────────────────────────────────────
        case AIIntent.ORDER:
          reply =
            `📦 Send me your order reference number (e.g. *ORD-001*) and I'll track it.\n\n` +
            `Or reply *MY ORDERS* to see your recent orders.`;
          await redis.del(retryKey);
          break;

        // ── FALLBACK ───────────────────────────────────────────────────
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
      reply =
        `❌ Something went wrong: ${err.message}\n\n` +
        `Please try again or reply *HELP* to speak to a support agent.`;
    }

    // Only send if there is something to send
    if (reply) {
      await whatsAppService.sendText(phone, reply);
    }
  }
}

export const whatsappService = new WhatsAppService();