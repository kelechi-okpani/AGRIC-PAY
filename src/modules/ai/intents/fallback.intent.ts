export const handleFallbackIntent = async (retryCount: number): Promise<string> => {
  if (retryCount >= 2) {
    return `I'm connecting you to a support agent now. Please hold on. 🙏`;
  }

  return `Sorry, I didn't quite get that. 🤔\n\nHere's what I can help you with:\n\n💸 *TRANSFER* — Send money\n💰 *BALANCE* — Check your wallet\n🌾 *BUY* — Shop for agro products\n💳 *CARD* — Virtual dollar card\n🪙 *CRYPTO* — Buy/swap crypto\n🏢 *BUSINESS* — Business account\n📦 *MY ORDERS* — Track your orders\n🆘 *HELP* — Talk to a human agent\n\nWhat would you like to do?`;
};