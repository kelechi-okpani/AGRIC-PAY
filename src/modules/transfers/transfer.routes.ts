import { Router, Request, Response } from 'express';
import { paystackService } from '../../infrastructure/paystack';
import { walletService } from '../wallets/wallet.service';
import { transferService } from './transfer.service';
import { logger } from '../../shared/utils/logger';


const router = Router();

// Paystack webhook
router.post('/webhook/paystack', async (req: Request, res: Response) => {
  const signature = req.headers['x-paystack-signature'] as string;
  const payload = JSON.stringify(req.body);

  if (!paystackService.verifyWebhookSignature(payload, signature)) {
    logger.warn('[Webhook] Invalid Paystack signature');
    return res.status(400).send('Invalid signature');
  }

  const { event, data } = req.body;

  try {
    switch (event) {
      case 'charge.success':
        if (data.metadata?.type === 'DEPOSIT') {
          await walletService.confirmDeposit(data.reference);
        }
        break;

      case 'transfer.success':
        await transferService.handleWebhookSuccess(data.reference);
        break;

      case 'transfer.failed':
      case 'transfer.reversed':
        await transferService.handleWebhookFailure(data.reference, event);
        break;

      default:
        logger.debug(`[Webhook] Unhandled Paystack event: ${event}`);
    }
  } catch (err) {
    logger.error('[Webhook] Processing error:', err);
  }

  res.sendStatus(200);
});

export default router;