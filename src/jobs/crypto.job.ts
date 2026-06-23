import { Worker } from 'bullmq';
import { Crypto } from '../modules/crypto/crypto.model';
import { walletService } from '../modules/wallets/wallet.service';
import { WalletType } from '../core/types/enums';
import { notificationQueue } from '../queues';
import { logger } from '../shared/utils/logger';

export const startCryptoWorker = () => {
  const worker = new Worker(
    'crypto',
    async (job) => {
      switch (job.name) {

        case 'process-swap': {
          const { transactionId, userId, fromAsset, toAsset, fromAmount, toAmount } = job.data;

          const txn = await Crypto.findById(transactionId);
          if (!txn) throw new Error('Crypto transaction not found');

          // Debit source wallet
          if (fromAsset === 'NGN') {
            await walletService.debit(userId, WalletType.NGN, fromAmount, `Crypto swap — ${fromAsset} to ${toAsset}`, { transactionId });
          } else {
            await walletService.debit(userId, WalletType.CRYPTO, fromAmount, `Crypto swap — ${fromAsset} to ${toAsset}`, { transactionId });
          }

          // Credit destination wallet
          if (toAsset === 'NGN') {
            await walletService.credit(userId, WalletType.NGN, toAmount, `Crypto swap received — ${toAsset}`, { transactionId });
          } else {
            await walletService.credit(userId, WalletType.CRYPTO, toAmount, `Crypto swap received — ${toAsset}`, { transactionId });
          }

          txn.status = 'SUCCESS';
          await txn.save();

          await notificationQueue.add('swap-success', {
            userId,
            channel: 'WHATSAPP',
            message: `✅ Crypto swap successful!\n${fromAmount} ${fromAsset} → ${toAmount.toFixed(6)} ${toAsset}`,
          });

          logger.info(`[Crypto Job] Swap completed: ${transactionId}`);
          break;
        }

        case 'process-buy': {
          const { transactionId, userId, asset, ngnAmount, cryptoAmount } = job.data;

          await walletService.debit(userId, WalletType.NGN, ngnAmount, `Buy crypto — ${asset}`, { transactionId });
          await walletService.credit(userId, WalletType.CRYPTO, cryptoAmount, `Crypto purchase — ${asset}`, { transactionId });

          await Crypto.findByIdAndUpdate(transactionId, { status: 'SUCCESS' });

          await notificationQueue.add('crypto-buy-success', {
            userId,
            channel: 'WHATSAPP',
            message: `✅ You have successfully purchased ${cryptoAmount.toFixed(6)} ${asset}!`,
          });
          break;
        }

        case 'process-sell': {
          const { transactionId, userId, asset, cryptoAmount, ngnAmount } = job.data;

          await walletService.debit(userId, WalletType.CRYPTO, cryptoAmount, `Sell crypto — ${asset}`, { transactionId });
          await walletService.credit(userId, WalletType.NGN, ngnAmount, `Crypto sale — ${asset}`, { transactionId });

          await Crypto.findByIdAndUpdate(transactionId, { status: 'SUCCESS' });

          await notificationQueue.add('crypto-sell-success', {
            userId,
            channel: 'WHATSAPP',
            message: `✅ Sold ${cryptoAmount.toFixed(6)} ${asset} for ₦${ngnAmount.toLocaleString()}!`,
          });
          break;
        }

        default:
          logger.warn(`[Crypto Job] Unknown job: ${job.name}`);
      }
    },
    {
      connection: { host: process.env.REDIS_HOST || 'localhost', port: 6379 },
    }
  );

  worker.on('failed', (job, err) => logger.error(`[Crypto Job] Failed job ${job?.id}:`, err));
  return worker;
};