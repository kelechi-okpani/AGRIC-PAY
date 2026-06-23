import jwt, { Secret } from 'jsonwebtoken';
import { env } from '../../config/env';
import { AuthUser, AuthAdmin } from '../../core/types/context';

export const signAccessToken = (payload: AuthUser | AuthAdmin): string =>
  (jwt.sign as unknown as any)(payload, env.JWT_SECRET as Secret, { expiresIn: env.JWT_EXPIRES_IN });

export const signRefreshToken = (payload: { id: string }): string =>
  (jwt.sign as unknown as any)(payload, env.JWT_REFRESH_SECRET as Secret, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });

export const verifyAccessToken = (token: string): AuthUser | AuthAdmin =>
  jwt.verify(token, env.JWT_SECRET as Secret) as AuthUser | AuthAdmin;

export const verifyRefreshToken = (token: string): { id: string } =>
  jwt.verify(token, env.JWT_REFRESH_SECRET as Secret) as { id: string };