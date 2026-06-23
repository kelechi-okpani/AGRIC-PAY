import { Request, Response, NextFunction } from 'express';
import { AdminRole } from '../core/types/enums';
import { ForbiddenError } from '../core/errors/AppError';

export const requireAdminRole = (...roles: AdminRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const admin = (req as any).admin;
    if (!admin || !roles.includes(admin.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };

export const requireKYCLevel = (level: number) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user || user.kycLevel < level) {
      return next(new ForbiddenError(`KYC Level ${level} required for this action`));
    }
    next();
  };