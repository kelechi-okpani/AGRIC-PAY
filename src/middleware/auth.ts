import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../shared/utils/jwt';
import { UnauthorizedError } from '../core/errors/AppError';

export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedError('No token provided');

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    (req as any).user = decoded;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};