import { Worker } from 'bullmq';
import { twilioService } from '../infrastructure/twilio';
import { User } from '../modules/auth/auth.model';
import { logger } from '../shared/utils/logger';

export const startNotificationWorker = () => {
  const worker = new Worker(
    'notification',
    async (job) => {
      const { userId, phone, channel, message } = job.data;

      let targetPhone = phone;
      if (!targetPhone && userId) {
        const user = await User.findById(userId);
        targetPhone = user?.phone;
      }

      if (!targetPhone) {
        logger.warn(`[Notification Job] No phone for job ${job.id}`);
        return;
      }

      switch (channel) {
        case 'WHATSAPP':
          await twilioService.sendWhatsApp(targetPhone, message);
          break;
        case 'SMS':
          await twilioService.sendSMS(targetPhone, message);
          break;
        default:
          logger.warn(`[Notification Job] Unknown channel: ${channel}`);
      }
    },
    {
      connection: { host: process.env.REDIS_HOST || 'localhost', port: 6379 },
      concurrency: 10,
    }
  );

  worker.on('failed', (job, err) => logger.error(`[Notification Job] Failed job ${job?.id}:`, err));
  return worker;
};