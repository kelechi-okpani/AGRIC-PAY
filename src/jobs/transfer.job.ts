import { Worker } from 'bullmq';
import { transferService } from '../modules/transfers/transfer.service';
import { logger } from '../shared/utils/logger';

export const startTransferWorker = () => {
  const worker = new Worker(
    'transfer',
    async (job) => {
      switch (job.name) {
        case 'bank-transfer':
          await transferService.processBankTransfer(job.data);
          break;
        case 'scheduled-transfer':
          logger.info(`[Transfer Job] Processing scheduled transfer: ${job.data.transferId}`);
          break;
        default:
          logger.warn(`[Transfer Job] Unknown job: ${job.name}`);
      }
    },
    { connection: { host: process.env.REDIS_HOST || 'localhost', port: 6379 } }
  );

  worker.on('failed', (job, err) => logger.error(`[Transfer Job] Failed job ${job?.id}:`, err));
  return worker;
};