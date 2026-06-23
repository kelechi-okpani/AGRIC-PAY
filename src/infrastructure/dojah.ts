import axios from 'axios';
import { env } from '../config/env';
import { AppError } from '../core/errors/AppError';

const dojahAxios = axios.create({
  baseURL: 'https://api.dojah.io',
  headers: { AppId: env.DOJAH_APP_ID, Authorization: env.DOJAH_SECRET_KEY },
});

class DojahService {
  async verifyBVN(bvn: string): Promise<{ valid: boolean; data?: any }> {
    try {
      const res = await dojahAxios.get(`/api/v1/kyc/bvn?bvn=${bvn}`);
      return { valid: res.data.entity?.bvn === bvn, data: res.data.entity };
    } catch {
      return { valid: false };
    }
  }

  async verifyNIN(nin: string): Promise<{ valid: boolean; data?: any }> {
    try {
      const res = await dojahAxios.get(`/api/v1/kyc/nin?nin=${nin}`);
      return { valid: !!res.data.entity, data: res.data.entity };
    } catch {
      return { valid: false };
    }
  }

  async faceMatch(data: { bvn: string; selfieUrl: string }): Promise<{ score: number; match: boolean }> {
    try {
      const res = await dojahAxios.post('/api/v1/kyc/photoid/verify', {
        bvn: data.bvn,
        selfie_image: data.selfieUrl,
      });
      const score = res.data.entity?.similarity || 0;
      return { score, match: score >= 0.8 };
    } catch {
      throw new AppError('Face match service unavailable', 503);
    }
  }
}

export const dojahService = new DojahService();