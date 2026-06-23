import { Worker } from 'bullmq';
import axios from 'axios';
import { logger } from '../shared/utils/logger';

export const startWebhookWorker = () => {
  const worker = new Worker(
    'webhook',
    async (job) => {
      const { url, payload, headers } = job.data;
      await axios.post(url, payload, { headers, timeout: 10000 });
      logger.info(`[Webhook Job] Delivered to ${url}`);
    },
    {
      connection: { host: process.env.REDIS_HOST || 'localhost', port: 6379 },
    }
  );

  worker.on('failed', (job, err) => logger.error(`[Webhook Job] Failed job ${job?.id}:`, err));
  return worker;
};