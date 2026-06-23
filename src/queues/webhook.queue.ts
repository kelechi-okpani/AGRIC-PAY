import { webhookQueue } from './index';

export const addWebhookJob = async (data: {
  url: string;
  payload: Record<string, any>;
  headers?: Record<string, string>;
}) => {
  return webhookQueue.add('deliver-webhook', data, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
  });
};