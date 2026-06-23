import { Request } from 'express';
import { UserRole, AdminRole } from './enums';

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
  kycLevel: number;
}

export interface AuthAdmin {
  id: string;
  email: string;
  role: AdminRole;
}

export interface GraphQLContext {
  req: Request;
  user?: AuthUser;
  admin?: AuthAdmin;
}