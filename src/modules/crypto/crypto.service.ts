import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Crypto, ICrypto } from './crypto.model';
import { walletService } from '../wallets/wallet.service';
import { cryptoQueue } from '../../queues';
import { WalletType } from '../../core/types/enums';
import { AppError, ValidationError } from '../../core/errors/AppError';
import redis from '../../config/redis';
import { logger } from '../../shared/utils/logger';

const SUPPORTED_ASSETS = ['BTC', 'ETH', 'USDT', 'BNB'];

export class CryptoService {

  async getExchangeRates(): Promise<Record<string, number>> {
    const cacheKey = 'crypto:rates';
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    try {
      const ids = 'bitcoin,ethereum,tether,binancecoin';
      const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=ngn`);
      const rates: Record<string, number> = {
        BTC: res.data.bitcoin?.ngn || 0,
        ETH: res.data.ethereum?.ngn || 0,
        USDT: res.data.tether?.ngn || 0,
        BNB: res.data.binancecoin?.ngn || 0,
      };
      await redis.set(cacheKey, JSON.stringify(rates), 'EX', 300);
      return rates;
    } catch (err) {
      logger.error('[Crypto] Rate fetch failed:', err);
      return { BTC: 95000000, ETH: 5000000, USDT: 1600, BNB: 700000 };
    }
  }

  async buyCrypto(userId: string, asset: string, ngnAmount: number): Promise<ICrypto> {
    if (!SUPPORTED_ASSETS.includes(asset)) throw new ValidationError(`Unsupported asset: ${asset}`);
    if (ngnAmount < 1000) throw new ValidationError('Minimum buy amount is ₦1,000');

    const rates = await this.getExchangeRates();
    const rate = rates[asset];
    const cryptoAmount = ngnAmount / rate;
    const reference = `BUY-${uuidv4()}`;

    const txn = await Crypto.create({
      userId,
      type: 'BUY',
      asset,
      fromAmount: ngnAmount,
      toAmount: cryptoAmount,
      rate,
      reference,
    });

    await cryptoQueue.add('process-buy', {
      transactionId: txn._id.toString(),
      userId,
      asset,
      ngnAmount,
      cryptoAmount,
    }, { attempts: 3 });

    return txn;
  }

  async sellCrypto(userId: string, asset: string, cryptoAmount: number): Promise<ICrypto> {
    if (!SUPPORTED_ASSETS.includes(asset)) throw new ValidationError(`Unsupported asset: ${asset}`);

    const rates = await this.getExchangeRates();
    const rate = rates[asset];
    const ngnAmount = cryptoAmount * rate;
    const reference = `SELL-${uuidv4()}`;

    const txn = await Crypto.create({
      userId,
      type: 'SELL',
      asset,
      fromAmount: cryptoAmount,
      toAmount: ngnAmount,
      rate,
      reference,
    });

    await cryptoQueue.add('process-sell', {
      transactionId: txn._id.toString(),
      userId,
      asset,
      cryptoAmount,
      ngnAmount,
    }, { attempts: 3 });

    return txn;
  }

  async swapCrypto(userId: string, fromAsset: string, toAsset: string, fromAmount: number): Promise<ICrypto> {
    if (!SUPPORTED_ASSETS.includes(fromAsset) || !SUPPORTED_ASSETS.includes(toAsset)) {
      throw new ValidationError('Unsupported swap pair');
    }

    const rates = await this.getExchangeRates();
    const fromRate = rates[fromAsset];
    const toRate = rates[toAsset];
    const fromNGN = fromAmount * fromRate;
    const toAmount = fromNGN / toRate;
    const reference = `SWAP-${uuidv4()}`;

    const txn = await Crypto.create({
      userId,
      type: 'SWAP',
      asset: `${fromAsset}/${toAsset}`,
      fromAsset,
      toAsset,
      fromAmount,
      toAmount,
      rate: fromRate / toRate,
      reference,
    });

    await cryptoQueue.add('process-swap', {
      transactionId: txn._id.toString(),
      userId,
      fromAsset,
      toAsset,
      fromAmount,
      toAmount,
    }, { attempts: 3 });

    return txn;
  }

  async getTransactionHistory(userId: string, filters: { limit?: number; offset?: number }) {
    const [transactions, total] = await Promise.all([
      Crypto.find({ userId }).sort({ createdAt: -1 }).skip(filters.offset || 0).limit(filters.limit || 20),
      Crypto.countDocuments({ userId }),
    ]);
    return { transactions, total };
  }
}

export const cryptoService = new CryptoService();