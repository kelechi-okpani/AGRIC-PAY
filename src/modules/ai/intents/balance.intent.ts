import { walletService } from '../../wallets/wallet.service';
import { WalletType } from '../../../core/types/enums';

export const handleBalanceIntent = async (userId: string): Promise<string> => {
  const [ngn, usd, crypto] = await Promise.all([
    walletService.getBalance(userId, WalletType.NGN),
    walletService.getBalance(userId, WalletType.USD),
    walletService.getBalance(userId, WalletType.CRYPTO),
  ]);

  return `💰 *Your Wallet Balances*\n\n🇳🇬 NGN Wallet: ₦${ngn.balance.toLocaleString()}\n💵 USD Wallet: $${usd.balance.toFixed(2)}\n🪙 Crypto Wallet: ${crypto.balance.toFixed(6)}\n\nReply *DEPOSIT* to fund your wallet or *TRANSFER* to send money.`;
};