import { notificationQueue } from './index';

export const addNotificationJob = async (data: {
  userId?: string;
  phone?: string;
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL';
  message: string;
  template?: string;
  variables?: Record<string, string>;
}) => {
  return notificationQueue.add('send-notification', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });
};