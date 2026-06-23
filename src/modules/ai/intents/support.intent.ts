import { aiService } from '../ai.service';
import { supportService } from '../../support/support.service';

export const handleSupportIntent = async (
  userId: string,
  userName: string,
  userMessage: string
): Promise<string> => {
  const state = await aiService.getConversationState(userId);

  if (!state?.supportStep) {
    await aiService.setConversationState(userId, { supportStep: 'GET_ISSUE' });
    return `🆘 I'm here to help, ${userName}!\n\nPlease briefly describe your issue and I'll create a support ticket for you.`;
  }

  if (state.supportStep === 'GET_ISSUE') {
    await supportService.createTicket(userId, userMessage);
    await aiService.setConversationState(userId, { supportStep: 'ESCALATE_OPTION', issue: userMessage });

    return `Got it! I've logged your issue:\n"${userMessage.slice(0, 80)}..."\n\nWould you like to speak with a human agent now?\n\nReply *YES* for a human agent or *NO* to wait for our team to contact you.`;
  }

  if (state.supportStep === 'ESCALATE_OPTION') {
    await aiService.clearConversationState(userId);

    if (userMessage.trim().toUpperCase() === 'YES') {
      await supportService.escalateToHuman(userId, state.issue);
      return `👤 Connecting you to a support agent now...\n\nPlease hold on. An agent will respond shortly. You can continue typing your messages here.`;
    } else {
      return `✅ Your ticket has been created. Our support team will reach out to you within 24 hours.\n\nIs there anything else I can help you with?`;
    }
  }

  return `Your support ticket is open. An agent will be with you shortly.`;
};