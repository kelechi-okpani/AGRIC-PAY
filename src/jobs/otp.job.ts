
import { Worker } from 'bullmq';
import { whatsAppService } from '../infrastructure/whatsapp';
import { logger } from '../shared/utils/logger';

export const startOtpWorker = () => {
  const worker = new Worker(
    'otp',
    async (job) => {
      const { phone, otp, type } = job.data;

      if (!phone || !otp) {
        logger.warn(`[OTP Job] Missing phone or OTP in job ${job.id}`);
        return;
      }

      await whatsAppService.sendOTP(
        phone,
        otp,
        type || 'register'
      );

      logger.info(`[OTP Job] OTP sent to ${phone} via WhatsApp Cloud API`);
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
    logger.info(`[OTP Job] Completed job ${job.id}`)
  );
  worker.on('failed', (job, err) =>
    logger.error(`[OTP Job] Failed job ${job?.id}:`, err)
  );

  return worker;
};
// import { Worker } from 'bullmq';
// import { whatsAppService } from '../infrastructure/whatsapp';
// import { logger } from '../shared/utils/logger';

// export const startOtpWorker = () => {
//   const worker = new Worker(
//     'otp',
//     async (job) => {
//       const { phone, otp, type } = job.data;
//       await whatsAppService.sendOTP(phone, otp, type || 'register');
//       logger.info(`[OTP Job] OTP sent via WhatsApp Cloud API to ${phone}`);
//     },
//     {
//       connection: { host: process.env.REDIS_HOST || 'localhost', port: 6379 },
//       concurrency: 10,
//     }
//   );

//   worker.on('failed', (job, err) =>
//     logger.error(`[OTP Job] Failed job ${job?.id}:`, err)
//   );

//   return worker;
// };