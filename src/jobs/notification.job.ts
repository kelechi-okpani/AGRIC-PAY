import { Worker } from 'bullmq';
import { User } from '../modules/auth/auth.model';
import { whatsAppService } from '../infrastructure/whatsapp';
import { logger } from '../shared/utils/logger';

export const startNotificationWorker = () => {
  const worker = new Worker(
    'notification',
    async (job) => {
      const { userId, phone, channel, message, template, variables } = job.data;

      // Resolve phone number
      let targetPhone = phone;
      if (!targetPhone && userId) {
        const user = await User.findById(userId);
        targetPhone = user?.phone;
      }

      if (!targetPhone) {
        logger.warn(`[Notification Job] No phone found for job ${job.id}`);
        return;
      }

      switch (channel) {
        case 'WHATSAPP':
          if (template) {
            await whatsAppService.sendTemplate({
              to:           targetPhone,
              templateName: template,
              components:   variables,
            });
          } else {
            await whatsAppService.sendText(targetPhone, message);
          }
          break;

        case 'SMS':
          // SMS is no longer via Twilio — log a warning
          // If you need SMS fallback, plug in Termii, AfricasTalking, etc. here
          logger.warn(`[Notification Job] SMS channel not configured — skipping job ${job.id}`);
          break;

        default:
          logger.warn(`[Notification Job] Unknown channel "${channel}" for job ${job.id}`);
      }
    },
    {
      connection: {
        host:     process.env.REDIS_HOST || 'localhost',
        port:     parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
      concurrency: 10,
    }
  );

  worker.on('completed', (job) =>
    logger.info(`[Notification Job] Completed job ${job.id} — channel: ${job.data.channel}`)
  );
  worker.on('failed', (job, err) =>
    logger.error(`[Notification Job] Failed job ${job?.id}:`, err)
  );

  return worker;
};