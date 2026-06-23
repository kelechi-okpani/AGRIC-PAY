import { aiService } from '../ai.service';
import { cardService } from '../../cards/card.service';

export const handleCardIntent = async (
  userId: string,
  entities: Record<string, any>,
  userMessage: string
): Promise<string> => {
  const state = await aiService.getConversationState(userId);
  const msg = userMessage.trim().toUpperCase();

  if (!state?.cardStep) {
    const cards = await cardService.getUserCards(userId);

    if (cards.length === 0) {
      await aiService.setConversationState(userId, { cardStep: 'CREATE_CONFIRM' });
      return `💳 You don't have a virtual dollar card yet.\n\nWould you like to create one? There is a one-time fee of $2.\n\nReply *YES* to create or *NO* to cancel.`;
    }

    const card = cards[0];
    return `💳 *Your Virtual Dollar Card*\n\nCard: *${card.maskedNumber}*\nBalance: $${card.balance.toFixed(2)}\nStatus: ${card.isActive ? (card.isFrozen ? '🔴 Frozen' : '🟢 Active') : '⚫ Inactive'}\n\nReply:\n*FUND* — Add money\n*FREEZE* — Freeze card\n*UNFREEZE* — Unfreeze card\n*TERMINATE* — Cancel card`;
  }

  if (state.cardStep === 'CREATE_CONFIRM') {
    if (msg === 'YES') {
      await aiService.clearConversationState(userId);
      try {
        await cardService.createCard(userId);
        return `✅ Your virtual dollar card is being created! You'll receive the details shortly.`;
      } catch (err: any) {
        return `❌ Card creation failed: ${err.message}`;
      }
    } else {
      await aiService.clearConversationState(userId);
      return `No problem! Reply *CARD* anytime to create your virtual dollar card.`;
    }
  }

  if (msg === 'FUND') {
    await aiService.setConversationState(userId, { cardStep: 'FUND_AMOUNT' });
    return `How much would you like to fund your card? (in USD)`;
  }

  if (state.cardStep === 'FUND_AMOUNT') {
    const amount = parseFloat(userMessage.replace(/[^0-9.]/g, ''));
    if (isNaN(amount) || amount <= 0) return `Please enter a valid amount in USD.`;

    await aiService.clearConversationState(userId);
    try {
      const cards = await cardService.getUserCards(userId);
      await cardService.fundCard(userId, cards[0]._id.toString(), amount);
      return `✅ Your card has been funded with $${amount.toFixed(2)}!`;
    } catch (err: any) {
      return `❌ Funding failed: ${err.message}`;
    }
  }

  if (msg === 'FREEZE') {
    await aiService.clearConversationState(userId);
    const cards = await cardService.getUserCards(userId);
    await cardService.freezeCard(userId, cards[0]._id.toString());
    return `🔴 Your virtual dollar card has been frozen. Reply *UNFREEZE* to reactivate it.`;
  }

  if (msg === 'UNFREEZE') {
    await aiService.clearConversationState(userId);
    const cards = await cardService.getUserCards(userId);
    await cardService.unfreezeCard(userId, cards[0]._id.toString());
    return `🟢 Your virtual dollar card has been unfrozen and is ready to use!`;
  }

  if (msg === 'TERMINATE') {
    await aiService.setConversationState(userId, { cardStep: 'TERMINATE_CONFIRM' });
    return `⚠️ Are you sure you want to permanently terminate your card? This cannot be undone.\n\nReply *YES* to confirm or *NO* to cancel.`;
  }

  if (state.cardStep === 'TERMINATE_CONFIRM') {
    if (msg === 'YES') {
      await aiService.clearConversationState(userId);
      const cards = await cardService.getUserCards(userId);
      await cardService.terminateCard(userId, cards[0]._id.toString());
      return `✅ Your card has been terminated. Reply *CARD* to create a new one.`;
    } else {
      await aiService.clearConversationState(userId);
      return `Termination cancelled. Your card is still active.`;
    }
  }

  return `Reply *FUND*, *FREEZE*, *UNFREEZE*, or *TERMINATE* to manage your card.`;
};