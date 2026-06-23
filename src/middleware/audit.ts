import { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/utils/logger';

export const auditLog = (action: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const actor = (req as any).user || (req as any).admin;
    logger.info({
      type: 'AUDIT',
      action,
      actorId: actor?.id,
      actorRole: actor?.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
    });
    next();
  };