import { otpQueue } from './index';

export const addOtpJob = async (data: {
  phone: string;
  otp: string;
  type?: 'VERIFICATION' | 'PASSWORD_RESET' | 'LOGIN';
}) => {
  return otpQueue.add('send-otp', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    priority: 1,
  });
};