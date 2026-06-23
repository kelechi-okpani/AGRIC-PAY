import { Worker } from 'bullmq';
import { twilioService } from '../infrastructure/twilio';
import { logger } from '../shared/utils/logger';

export const startOtpWorker = () => {
  const worker = new Worker(
    'otp',
    async (job) => {
      const { phone, otp, type } = job.data;
      const message = type === 'PASSWORD_RESET'
        ? `Your AgroFinPay password reset OTP is: ${otp}. Expires in 5 minutes.`
        : `Your AgroFinPay verification OTP is: ${otp}. Expires in 5 minutes.`;

      await twilioService.sendSMS(phone, message);
      logger.info(`[OTP Job] OTP sent to ${phone}`);
    },
    { connection: { host: process.env.REDIS_HOST || 'localhost', port: 6379 } }
  );

  worker.on('failed', (job, err) => logger.error(`[OTP Job] Failed job ${job?.id}:`, err));
  return worker;
};