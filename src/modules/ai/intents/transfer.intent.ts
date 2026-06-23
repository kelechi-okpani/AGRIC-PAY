import { walletService } from '../../wallets/wallet.service';
import { transferService } from '../../transfers/transfer.service';
import { aiService } from '../ai.service';
import { WalletType } from '../../../core/types/enums';
import { User } from '../../auth/auth.model';

export const handleTransferIntent = async (
  userId: string,
  entities: Record<string, any>,
  userMessage: string
): Promise<string> => {
  const state = await aiService.getConversationState(userId);

  // Step 1: Get recipient
  if (!state?.transferStep) {
    if (entities.phone && entities.amount) {
      await aiService.setConversationState(userId, {
        transferStep: 'CONFIRM',
        phone: entities.phone,
        amount: entities.amount,
      });

      const recipient = await User.findOne({ phone: entities.phone });
      if (!recipient) return `❌ I couldn't find a user with phone ${entities.phone}. Please check the number and try again.`;

      const { balance } = await walletService.getBalance(userId, WalletType.NGN);
      if (balance < entities.amount) return `❌ Insufficient balance. Your NGN wallet balance is ₦${balance.toLocaleString()}.`;

      return `You're about to send ₦${Number(entities.amount).toLocaleString()} to *${recipient.fullName}* (${entities.phone}).\n\nReply *YES* to confirm or *NO* to cancel.`;
    }

    await aiService.setConversationState(userId, { transferStep: 'GET_PHONE' });
    return `Sure! Who do you want to send money to? Please send me their phone number.`;
  }

  if (state.transferStep === 'GET_PHONE') {
    const phone = userMessage.replace(/\s/g, '');
    const recipient = await User.findOne({ phone });
    if (!recipient) return `❌ No AgroFinPay user found with number ${phone}. Please check and try again.`;

    await aiService.setConversationState(userId, { transferStep: 'GET_AMOUNT', phone });
    return `Got it! How much do you want to send to *${recipient.fullName}*?`;
  }

  if (state.transferStep === 'GET_AMOUNT') {
    const amount = parseFloat(userMessage.replace(/[^0-9.]/g, ''));
    if (isNaN(amount) || amount <= 0) return `Please enter a valid amount. E.g. *5000*`;

    const { balance } = await walletService.getBalance(userId, WalletType.NGN);
    if (balance < amount) return `❌ Insufficient balance. Your balance is ₦${balance.toLocaleString()}.`;

    const recipient = await User.findOne({ phone: state.phone });
    await aiService.setConversationState(userId, { transferStep: 'CONFIRM', phone: state.phone, amount });

    return `You're about to send ₦${amount.toLocaleString()} to *${recipient?.fullName}* (${state.phone}).\n\nReply *YES* to confirm or *NO* to cancel.`;
  }

  if (state.transferStep === 'CONFIRM') {
    if (userMessage.trim().toUpperCase() === 'YES') {
      await aiService.clearConversationState(userId);
      try {
        const transfer = await transferService.internalTransfer(userId, { toPhone: state.phone, amount: state.amount });
        return `✅ Transfer successful!\n₦${state.amount.toLocaleString()} sent to ${state.phone}.\nRef: ${transfer.reference}`;
      } catch (err: any) {
        return `❌ Transfer failed: ${err.message}`;
      }
    } else {
      await aiService.clearConversationState(userId);
      return `Transfer cancelled. Is there anything else I can help you with?`;
    }
  }

  return `Something went wrong. Let's start over. How much do you want to send and to whom?`;
};