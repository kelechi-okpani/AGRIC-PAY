import { Queue } from 'bullmq';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

const defaultJobOptions = {
  removeOnComplete: 100,
  removeOnFail: 200,
};

export const otpQueue = new Queue('otp', { connection, defaultJobOptions });
export const transferQueue = new Queue('transfer', { connection, defaultJobOptions });
export const notificationQueue = new Queue('notification', { connection, defaultJobOptions });
export const webhookQueue = new Queue('webhook', { connection, defaultJobOptions });
export const cryptoQueue = new Queue('crypto', { connection, defaultJobOptions });
export const cardQueue = new Queue('card', { connection, defaultJobOptions });

export const queues = {
  otp: otpQueue,
  transfer: transferQueue,
  notification: notificationQueue,
  webhook: webhookQueue,
  crypto: cryptoQueue,
  card: cardQueue,
};

export type QueueName = keyof typeof queues;