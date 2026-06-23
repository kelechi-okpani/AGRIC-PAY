import crypto from 'crypto';
import redis from '../../config/redis';

const OTP_TTL = 300; // 5 minutes

export const generateOTP = (): string =>
  crypto.randomInt(100000, 999999).toString();

export const saveOTP = async (phone: string, otp: string): Promise<void> => {
  await redis.set(`otp:${phone}`, otp, 'EX', OTP_TTL);
};

export const verifyOTP = async (phone: string, otp: string): Promise<boolean> => {
  const stored = await redis.get(`otp:${phone}`);
  if (!stored || stored !== otp) return false;
  await redis.del(`otp:${phone}`);
  return true;
};