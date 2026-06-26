import { Router, Request, Response } from 'express';
import { depositWithdrawalService }  from './deposit-withdrawal.service';
import { paystackService } from '@infrastructure/paystack';
import { logger } from '@shared/utils/logger';
import { authenticate } from '@middleware/auth';

const router = Router();

// ── PAYSTACK WEBHOOK ──────────────────────────────────────────────────────────
router.post('/webhook/paystack', async (req: Request, res: Response) => {
  const signature = req.headers['x-paystack-signature'] as string;
  const payload   = JSON.stringify(req.body);

  if (!paystackService.verifyWebhookSignature(payload, signature)) {
    logger.warn('[Webhook/Paystack] Invalid signature');
    return res.status(400).send('Invalid signature');
  }

  // Always 200 immediately — Paystack retries if it doesn't get a fast response
  res.sendStatus(200);

  const { event, data } = req.body;
  logger.info(`[Webhook/Paystack] Event: ${event} | Ref: ${data?.reference}`);

  try {
    switch (event) {

      // ── Bank transfer landed in user's dedicated virtual account ──
      case 'charge.success': {
        const userId = data?.customer?.metadata?.userId
          || data?.metadata?.userId;

        if (!userId) {
          logger.warn(`[Webhook/Paystack] charge.success: no userId in metadata`);
          break;
        }

        const amountNGN = data.amount / 100; // Paystack sends kobo
        await depositWithdrawalService.confirmDeposit(
          data.reference,
          amountNGN,
          userId
        );
        break;
      }

      // ── Paystack transfer (withdrawal) succeeded ───────────────
      case 'transfer.success':
        await depositWithdrawalService.confirmWithdrawal(
          data.reference,
          data.transfer_code
        );
        break;

      // ── Paystack transfer failed ───────────────────────────────
      case 'transfer.failed':
        await depositWithdrawalService.failWithdrawal(
          data.reference,
          data.reason || 'Transfer failed at gateway'
        );
        break;

      // ── Paystack transfer reversed by receiving bank ───────────
      case 'transfer.reversed':
        await depositWithdrawalService.failWithdrawal(
          data.reference,
          'Transfer reversed by receiving bank'
        );
        break;

      // ── DVA successfully assigned to customer ──────────────────
      case 'dedicatedaccount.assign.success':
        logger.info(`[Webhook/Paystack] DVA assigned: ${data?.account_number}`);
        break;

      default:
        logger.debug(`[Webhook/Paystack] Unhandled event: ${event}`);
    }
  } catch (err) {
    logger.error(`[Webhook/Paystack] Processing error for ${event}:`, err);
  }
});

// ── GET DEPOSIT STATUS (REST fallback) ────────────────────────────────────────
router.get('/deposits/:reference', authenticate, async (req: Request, res: Response) => {
  try {
    const userId  = (req as any).user.id;
    const deposit = await depositWithdrawalService.getDepositByReference(
      req.params.reference,
      userId
    );
    res.json({ success: true, deposit });
  } catch (err: any) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── GET WITHDRAWAL STATUS (REST fallback) ─────────────────────────────────────
router.get('/withdrawals/:reference', authenticate, async (req: Request, res: Response) => {
  try {
    const userId     = (req as any).user.id;
    const withdrawal = await depositWithdrawalService.getWithdrawalByReference(
      req.params.reference,
      userId
    );
    res.json({ success: true, withdrawal });
  } catch (err: any) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── GET VIRTUAL ACCOUNT (REST) ────────────────────────────────────────────────
router.get('/virtual-account', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const dva    = await depositWithdrawalService.createOrGetVirtualAccount(userId);
    res.json({ success: true, virtualAccount: dva });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;