import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { z } from 'zod';
import { ValidationError } from '../../core/errors/AppError';

const registerSchema = z.object({
  phone: z.string().regex(/^(\+234|0)[789][01]\d{8}$/, 'Invalid Nigerian phone number'),
  fullName: z.string().min(2).max(100),
  email: z.string().email().optional(),
  role: z.enum(['CONSUMER', 'VENDOR', 'MERCHANT']).optional(),
});

const otpSchema = z.object({
  phone: z.string(),
  otp: z.string().length(6),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
});

const loginSchema = z.object({
  phone: z.string(),
  password: z.string().optional(),
  deviceId: z.string().optional(),
  deviceName: z.string().optional(),
});

const resetPasswordSchema = z.object({
  phone: z.string(),
  otp: z.string().length(6),
  newPassword: z.string().min(8),
});

export class AuthController {

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data:any = registerSchema.parse(req.body);
      const result = await authService.register(data);
      res.status(201).json({ success: true, ...result });
    } catch (err: any) {
      if (err.name === 'ZodError') return next(new ValidationError(err.errors[0].message));
      next(err);
    }
  }

  async verifyOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const data = otpSchema.parse(req.body);
      const result = await authService.verifyOtp({ ...data, ip: req.ip });
      res.json({ success: true, ...result });
    } catch (err: any) {
      if (err.name === 'ZodError') return next(new ValidationError(err.errors[0].message));
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const data = loginSchema.parse(req.body);
      const result = await authService.login({ ...data, ip: req.ip });
      res.json({ success: true, ...result });
    } catch (err: any) {
      if (err.name === 'ZodError') return next(new ValidationError(err.errors[0].message));
      next(err);
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return next(new ValidationError('Refresh token required'));
      const result = await authService.refreshToken(refreshToken);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { phone } = req.body;
      const result = await authService.forgotPassword(phone);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const data = resetPasswordSchema.parse(req.body);
      await authService.resetPassword(data);
      res.json({ success: true, message: 'Password reset successfully.' });
    } catch (err: any) {
      if (err.name === 'ZodError') return next(new ValidationError(err.errors[0].message));
      next(err);
    }
  }

  async resendOTP(req: Request, res: Response, next: NextFunction) {
    try {
      const { phone } = req.body;
      const result = await authService.resendOTP(phone);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }

  async setup2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const result = await authService.setup2FA(userId);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }

  async enable2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { token } = req.body;
      await authService.enable2FA(userId, token);
      res.json({ success: true, message: '2FA enabled successfully.' });
    } catch (err) { next(err); }
  }

  async verify2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, token } = req.body;
      const result = await authService.verify2FA(userId, token);
      res.json({ success: true, ...result });
    } catch (err) { next(err); }
  }

  async getSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const sessions = await authService.getSessions(userId);
      res.json({ success: true, sessions });
    } catch (err) { next(err); }
  }

  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { deviceId } = req.params;
      await authService.revokeSession(userId, deviceId);
      res.json({ success: true, message: 'Session revoked.' });
    } catch (err) { next(err); }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      await authService.logout(userId);
      res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) { next(err); }
  }
}

export const authController = new AuthController();