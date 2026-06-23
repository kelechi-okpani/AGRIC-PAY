import { aiService } from '../ai.service';
import { cryptoService } from '../../crypto/crypto.service';

const SUPPORTED_ASSETS = ['BTC', 'ETH', 'USDT', 'BNB'];

export const handleSwapIntent = async (
  userId: string,
  entities: Record<string, any>,
  userMessage: string
): Promise<string> => {
  const state = await aiService.getConversationState(userId);

  if (!state?.swapStep) {
    const rates = await cryptoService.getExchangeRates();
    const ratesList = SUPPORTED_ASSETS.map((a) => `${a}: ₦${(rates[a] || 0).toLocaleString()}`).join('\n');

    await aiService.setConversationState(userId, { swapStep: 'SELECT_ACTION' });

    return `🪙 *Crypto Menu*\n\n*Current Rates (NGN)*\n${ratesList}\n\nWhat would you like to do?\n\n*BUY* — Buy crypto with NGN\n*SELL* — Sell crypto for NGN\n*SWAP* — Swap between assets`;
  }

  if (state.swapStep === 'SELECT_ACTION') {
    const action = userMessage.trim().toUpperCase();

    if (!['BUY', 'SELL', 'SWAP'].includes(action)) {
      return `Please reply *BUY*, *SELL*, or *SWAP*.`;
    }

    await aiService.setConversationState(userId, { swapStep: 'SELECT_ASSET', action });
    return `Which crypto? Reply with: ${SUPPORTED_ASSETS.join(', ')}`;
  }

  if (state.swapStep === 'SELECT_ASSET') {
    const asset = userMessage.trim().toUpperCase();
    if (!SUPPORTED_ASSETS.includes(asset)) {
      return `Please choose one of: ${SUPPORTED_ASSETS.join(', ')}`;
    }

    await aiService.setConversationState(userId, { ...state, swapStep: 'ENTER_AMOUNT', asset });

    if (state.action === 'BUY') return `How much NGN would you like to spend to buy ${asset}?`;
    if (state.action === 'SELL') return `How much ${asset} would you like to sell?`;
    return `How much ${asset} would you like to swap?`;
  }

  if (state.swapStep === 'ENTER_AMOUNT') {
    const amount = parseFloat(userMessage.replace(/[^0-9.]/g, ''));
    if (isNaN(amount) || amount <= 0) return `Please enter a valid amount.`;

    const rates = await cryptoService.getExchangeRates();
    const rate = rates[state.asset] || 0;

    let preview = '';
    if (state.action === 'BUY') {
      const cryptoAmount = amount / rate;
      preview = `Spend ₦${amount.toLocaleString()} → Receive ${cryptoAmount.toFixed(6)} ${state.asset}`;
    } else if (state.action === 'SELL') {
      const ngnAmount = amount * rate;
      preview = `Sell ${amount} ${state.asset} → Receive ₦${ngnAmount.toLocaleString()}`;
    } else {
      preview = `Swap ${amount} ${state.asset}`;
    }

    await aiService.setConversationState(userId, { ...state, swapStep: 'CONFIRM', amount });
    return `*${state.action} ${state.asset}*\n\n${preview}\n\nReply *YES* to confirm or *NO* to cancel.`;
  }

  if (state.swapStep === 'CONFIRM') {
    await aiService.clearConversationState(userId);

    if (userMessage.trim().toUpperCase() === 'YES') {
      try {
        if (state.action === 'BUY') {
          await cryptoService.buyCrypto(userId, state.asset, state.amount);
          return `✅ Crypto purchase initiated! Your ${state.asset} will be credited shortly.`;
        } else if (state.action === 'SELL') {
          await cryptoService.sellCrypto(userId, state.asset, state.amount);
          return `✅ Crypto sale initiated! NGN will be credited to your wallet shortly.`;
        } else {
          return `✅ Swap initiated! Your crypto will be updated shortly.`;
        }
      } catch (err: any) {
        return `❌ Transaction failed: ${err.message}`;
      }
    } else {
      return `Transaction cancelled. Reply *CRYPTO* to start again.`;
    }
  }

  return `Reply *BUY*, *SELL*, or *SWAP* to get started.`;
};