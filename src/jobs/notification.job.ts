import { Worker }          from 'bullmq';
import { User }            from '../modules/auth/auth.model';
import { whatsAppService } from '../infrastructure/whatsapp';
import { logger }          from '../shared/utils/logger';

export const startNotificationWorker = () => {
  const worker = new Worker(
    'notification',
    async (job) => {
      const { userId, phone, channel, message, template, variables } = job.data;

      // ── Resolve phone number ────────────────────────────────────
      let targetPhone = phone;

      if (!targetPhone && userId) {
        const user   = await User.findById(userId);
        targetPhone  = user?.phone;
      }

      if (!targetPhone) {
        logger.warn(`[Notification Job] No phone found for job ${job.id}`);
        return;
      }

      // ── Dispatch by channel ────────────────────────────────────
      switch (channel) {

        case 'WHATSAPP':
          if (template) {
            // Send as Twilio template / content message
            await whatsAppService.sendTemplate({
              to:           targetPhone,
              templateName: template,
              variables:    variables,
            });
          } else {
            await whatsAppService.sendText(targetPhone, message);
          }
          break;

        case 'SMS':
          // WhatsApp-first app — SMS not configured
          // Plug in Termii or Africa's Talking here if SMS needed
          logger.warn(
            `[Notification Job] SMS not configured — skipping job ${job.id} for ${targetPhone}`
          );
          break;

        case 'EMAIL':
          // Plug in Resend, Nodemailer, or Sendgrid here
          logger.warn(
            `[Notification Job] EMAIL not configured — skipping job ${job.id}`
          );
          break;

        default:
          logger.warn(
            `[Notification Job] Unknown channel "${channel}" for job ${job.id}`
          );
      }
    },
    {
      connection: {
        host:     process.env.REDIS_HOST     || 'localhost',
        port:     parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
      concurrency: 10,
    }
  );

  worker.on('completed', (job) =>
    logger.info(
      `[Notification Job] ✅ Completed: ${job.id} — channel: ${job.data.channel}`
    )
  );

  worker.on('failed', (job, err) =>
    logger.error(
      `[Notification Job] ❌ Failed: ${job?.id} — ${err.message}`
    )
  );

  return worker;
};