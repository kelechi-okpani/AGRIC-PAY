import { adminService } from './admin.service';
import { kycService } from '../kyc/kyc.service';
import { supportService } from '../support/support.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError, ForbiddenError } from '../../core/errors/AppError';
import { AdminRole, TransferStatus } from '../../core/types/enums';

const adminGuard = (ctx: GraphQLContext, ...roles: AdminRole[]) => {
  if (!ctx.admin) throw new UnauthorizedError();
  if (roles.length && !roles.includes(ctx.admin.role)) throw new ForbiddenError();
  return ctx.admin;
};

export const adminResolvers = {
  Query: {
    adminDashboard: (_: any, __: any, ctx: GraphQLContext) => {
      adminGuard(ctx);
      return adminService.getDashboardStats();
    },
    adminUsers: (_: any, args: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS_ADMIN);
      return adminService.getUsers(args);
    },
    adminTransfers: (_: any, args: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.FINANCE_ADMIN, AdminRole.OPERATIONS_ADMIN);
      return adminService.getAllTransfers(args);
    },
    adminKYCs: (_: any, args: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.COMPLIANCE_ADMIN, AdminRole.SUPER_ADMIN);
      return kycService.getPendingKYCs(args);
    },
    adminTickets: (_: any, args: any, ctx: GraphQLContext) => {
      adminGuard(ctx);
      return supportService.getTickets(args);
    },
    topCustomers: (_: any, { limit }: any, ctx: GraphQLContext) => {
      adminGuard(ctx);
      return adminService.getTopCustomers(limit);
    },
    growthMetrics: (_: any, __: any, ctx: GraphQLContext) => {
      adminGuard(ctx);
      return adminService.getGrowthMetrics();
    },
    allAdmins: (_: any, __: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN);
      return Admin.find();
    },
  },

  Mutation: {
    adminLogin: (_: any, { email, password }: any) => adminService.login(email, password),

    createAdmin: (_: any, args: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx, AdminRole.SUPER_ADMIN);
      return adminService.createAdmin(args, admin.id);
    },
    updateAdmin: (_: any, { id, ...data }: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN);
      return adminService.updateAdmin(id, data);
    },
    deleteAdmin: async (_: any, { id }: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN);
      await adminService.deleteAdmin(id);
      return { success: true, message: 'Admin deleted.' };
    },
    suspendUser: async (_: any, { userId }: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS_ADMIN);
      await adminService.suspendUser(userId, admin.id);
      return { success: true, message: 'User suspended.' };
    },
    unsuspendUser: async (_: any, { userId }: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS_ADMIN);
      await adminService.unsuspendUser(userId);
      return { success: true, message: 'User unsuspended.' };
    },
    adminFreezeWallet: async (_: any, { userId, walletType, reason }: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.FINANCE_ADMIN, AdminRole.OPERATIONS_ADMIN);
      await adminService.freezeUserWallet(userId, walletType, reason, admin.id);
      return { success: true, message: 'Wallet frozen.' };
    },
    adminUnfreezeWallet: async (_: any, { userId, walletType }: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.FINANCE_ADMIN);
      await adminService.unfreezeUserWallet(userId, walletType);
      return { success: true, message: 'Wallet unfrozen.' };
    },
    adminResetPassword: async (_: any, { userId, newPassword }: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS_ADMIN);
      await adminService.resetUserPassword(userId, newPassword);
      return { success: true, message: 'Password reset.' };
    },
    adminRefundTransfer: async (_: any, { transferId }: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.FINANCE_ADMIN);
      await adminService.adminRefundTransfer(transferId, admin.id);
      return { success: true, message: 'Transfer refunded.' };
    },
    adminApproveKYC: async (_: any, { kycId }: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx, AdminRole.COMPLIANCE_ADMIN, AdminRole.SUPER_ADMIN);
      await kycService.approveKYC(kycId, admin.id);
      return { success: true, message: 'KYC approved.' };
    },
    adminRejectKYC: async (_: any, { kycId, reason }: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx, AdminRole.COMPLIANCE_ADMIN, AdminRole.SUPER_ADMIN);
      await kycService.rejectKYC(kycId, admin.id, reason);
      return { success: true, message: 'KYC rejected.' };
    },
    adminAssignTicket: (_: any, { ticketId, agentId }: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.CUSTOMER_SUPPORT_MANAGER);
      return supportService.assignTicket(ticketId, agentId);
    },
    adminCloseTicket: (_: any, { ticketId }: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx);
      return supportService.closeTicket(ticketId, admin.id);
    },
  },
};

import { Admin } from './admin.model';