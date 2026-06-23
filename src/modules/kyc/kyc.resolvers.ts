import { kycService } from './kyc.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError, ForbiddenError } from '../../core/errors/AppError';
import { AdminRole } from '../../core/types/enums';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

const adminGuard = (ctx: GraphQLContext, ...roles: AdminRole[]) => {
  if (!ctx.admin) throw new UnauthorizedError();
  if (roles.length && !roles.includes(ctx.admin.role)) throw new ForbiddenError();
  return ctx.admin;
};

export const kycResolvers = {
  Query: {
    myKYCStatus: async (_: any, __: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return kycService.getKYCStatus(user.id);
    },
    pendingKYCs: async (_: any, args: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.COMPLIANCE_ADMIN, AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS_ADMIN);
      return kycService.getPendingKYCs(args);
    },
  },

  Mutation: {
    submitBVN: async (_: any, { bvn }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return kycService.submitBVN(user.id, bvn);
    },
    submitNIN: async (_: any, { nin }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return kycService.submitNIN(user.id, nin);
    },
    submitFaceMatch: async (_: any, { selfieBase64 }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return kycService.submitFaceMatch(user.id, selfieBase64);
    },
    uploadKYCDocument: async (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return kycService.uploadDocument(user.id, args);
    },
    approveKYC: async (_: any, { kycId }: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx, AdminRole.COMPLIANCE_ADMIN, AdminRole.SUPER_ADMIN);
      await kycService.approveKYC(kycId, admin.id);
      return { success: true, message: 'KYC approved.' };
    },
    rejectKYC: async (_: any, { kycId, reason }: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx, AdminRole.COMPLIANCE_ADMIN, AdminRole.SUPER_ADMIN);
      await kycService.rejectKYC(kycId, admin.id, reason);
      return { success: true, message: 'KYC rejected.' };
    },
    requestKYCResubmission: async (_: any, { kycId, note }: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx, AdminRole.COMPLIANCE_ADMIN, AdminRole.SUPER_ADMIN);
      await kycService.requestResubmission(kycId, admin.id, note);
      return { success: true, message: 'Resubmission requested.' };
    },
  },
};