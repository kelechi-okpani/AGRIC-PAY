import { Router, Request, Response } from 'express';
import { depositWithdrawalService }  from './deposit-withdrawal.service';
import { paystackService } from '@infrastructure/paystack';
import { logger } from '@shared/utils/logger';


const router = Router();

// ── PAYSTACK WEBHOOK ──────────────────────────────────────────────────────────
router.post('/webhook/paystack', async (req: Request, res: Response) => {
  const signature = req.headers['x-paystack-signature'] as string;
  const payload   = JSON.stringify(req.body);

  if (!paystackService.verifyWebhookSignature(payload, signature)) {
    logger.warn('[Webhook] Invalid Paystack signature');
    return res.status(400).send('Invalid signature');
  }

  res.sendStatus(200);

  const { event, data } = req.body;
  logger.info(`[Webhook/Paystack] ${event} | ref: ${data?.reference}`);

  try {
    switch (event) {

      // ── User paid into their dedicated virtual account ─────────────
      case 'dedicatedaccount.assign.success':
        logger.info(`[Webhook] DVA assigned: ${data?.account_number}`);
        break;

      // ── Bank transfer received into virtual account ─────────────────
      case 'charge.success': {
        // This fires when money lands in the DVA
        const userId = data?.customer?.metadata?.userId
          || data?.metadata?.userId;

        if (userId && data?.amount) {
          const amountNGN = data.amount / 100; // convert from kobo
          await depositWithdrawalService.confirmDeposit(
            data.reference,
            amountNGN,
            userId
          );
        }
        break;
      }

      // ── Withdrawal (Paystack transfer) succeeded ───────────────────
      case 'transfer.success':
        await depositWithdrawalService.confirmWithdrawal(
          data.reference,
          data.transfer_code
        );
        break;

      // ── Withdrawal failed ──────────────────────────────────────────
      case 'transfer.failed':
        await depositWithdrawalService.failWithdrawal(
          data.reference,
          data.reason || 'Transfer failed at gateway'
        );
        break;

      // ── Withdrawal reversed by bank ────────────────────────────────
      case 'transfer.reversed':
        await depositWithdrawalService.failWithdrawal(
          data.reference,
          'Transfer reversed by receiving bank'
        );
        break;

      default:
        logger.debug(`[Webhook/Paystack] Unhandled event: ${event}`);
    }
  } catch (err) {
    logger.error(`[Webhook/Paystack] Processing error:`, err);
  }
});

export default router;