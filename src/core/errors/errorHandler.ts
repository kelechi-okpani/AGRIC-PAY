import { Request, Response, NextFunction } from 'express';
import { GraphQLError } from 'graphql';
import { AppError } from './AppError';
import { logger } from '../../shared/utils/logger';

export const expressErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
    });
    return;
  }
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Something went wrong' });
};

export const formatGraphQLError = (error: GraphQLError) => {
  const original = error.originalError;
  if (original instanceof AppError) {
    return {
      message: original.message,
      extensions: { code: original.code, statusCode: original.statusCode },
    };
  }
  logger.error('GraphQL error:', error);
  return {
    message: 'Internal server error',
    extensions: { code: 'INTERNAL_ERROR' },
  };
};