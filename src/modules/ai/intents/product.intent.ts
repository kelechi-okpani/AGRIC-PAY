import { productService } from '../../products/product.service';
import { aiService } from '../ai.service';

export const handleBuyProductIntent = async (
  userId: string,
  entities: Record<string, any>,
  userMessage: string
): Promise<string> => {
  const state = await aiService.getConversationState(userId);

  if (!state?.productStep) {
    const query = entities.product || userMessage;
    const { products } = await productService.searchProducts({ query, limit: 5 });

    if (!products.length) {
      return `😔 No products found matching "${query}". Try a different search like *tomatoes*, *yam*, or *rice*.`;
    }

    const listing = products.map((p, i) => `${i + 1}. *${p.name}* — ₦${p.price.toLocaleString()} per ${p.unit}\n   ${p.description.slice(0, 60)}...`).join('\n\n');

    await aiService.setConversationState(userId, { productStep: 'SELECT', products: products.map((p) => ({ id: p._id, name: p.name, price: p.price, unit: p.unit, merchantId: p.merchantId })) });

    return `🌾 *Available Products*\n\n${listing}\n\nReply with the number to select a product.`;
  }

  if (state.productStep === 'SELECT') {
    const idx = parseInt(userMessage.trim()) - 1;
    if (isNaN(idx) || idx < 0 || idx >= state.products.length) {
      return `Please reply with a number between 1 and ${state.products.length}.`;
    }

    const selected = state.products[idx];
    await aiService.setConversationState(userId, { productStep: 'QUANTITY', selected });
    return `You selected *${selected.name}* at ₦${selected.price.toLocaleString()} per ${selected.unit}.\n\nHow many ${selected.unit} do you want?`;
  }

  if (state.productStep === 'QUANTITY') {
    const quantity = parseInt(userMessage.trim());
    if (isNaN(quantity) || quantity <= 0) return `Please enter a valid quantity.`;

    const subtotal = state.selected.price * quantity;
    const total = subtotal + 500;

    await aiService.setConversationState(userId, { productStep: 'ADDRESS', selected: state.selected, quantity, total });
    return `*${quantity} ${state.selected.unit} of ${state.selected.name}*\nSubtotal: ₦${subtotal.toLocaleString()}\nDelivery: ₦500\n*Total: ₦${total.toLocaleString()}*\n\nWhat is your delivery address?`;
  }

  if (state.productStep === 'ADDRESS') {
    await aiService.setConversationState(userId, { ...state, productStep: 'CONFIRM', address: userMessage });
    return `Ready to place your order:\n\n*${state.quantity} ${state.selected.unit} of ${state.selected.name}*\nDelivery to: ${userMessage}\n*Total: ₦${state.total.toLocaleString()}*\n\nReply *YES* to confirm or *NO* to cancel.`;
  }

  if (state.productStep === 'CONFIRM') {
    if (userMessage.trim().toUpperCase() === 'YES') {
      await aiService.clearConversationState(userId);
      return `✅ Your order has been placed! We'll notify you once the seller confirms. Reply *MY ORDERS* to track your order.`;
    } else {
      await aiService.clearConversationState(userId);
      return `Order cancelled. Is there anything else I can help you with?`;
    }
  }

  return `Let's start over. What product are you looking for?`;
};