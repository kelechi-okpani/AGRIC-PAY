import { depositWithdrawalService } from './deposit-withdrawal.service';
import { GraphQLContext }           from '../../core/types/context';
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

export const depositWithdrawalResolvers = {
  Query: {
    myDeposits: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return depositWithdrawalService.getUserDeposits(user.id, args);
    },

    myWithdrawals: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return depositWithdrawalService.getUserWithdrawals(user.id, args);
    },

    deposit: (_: any, { reference }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return depositWithdrawalService.getDepositByReference(reference, user.id);
    },

    withdrawal: (_: any, { reference }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return depositWithdrawalService.getWithdrawalByReference(reference, user.id);
    },

    verifyDeposit: (_: any, { reference }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return depositWithdrawalService.verifyDepositStatus(reference, user.id);
    },

    banks: () => depositWithdrawalService.getBanks(),

    resolveAccount: (_: any, { accountNumber, bankCode }: any) =>
      depositWithdrawalService.resolveBankAccount(accountNumber, bankCode),

    withdrawalFee: (_: any, { amount }: any) => {
      const fee   = amount <= 5000 ? 10 : amount <= 50000 ? 25 : amount <= 200000 ? 50 : 100;
      const total = amount + fee;
      const note  = amount <= 5000
        ? 'Flat ₦10 fee for transfers up to ₦5,000'
        : amount <= 50000
        ? 'Flat ₦25 fee for transfers ₦5,001 – ₦50,000'
        : amount <= 200000
        ? 'Flat ₦50 fee for transfers ₦50,001 – ₦200,000'
        : 'Flat ₦100 fee for transfers above ₦200,000';
      return { amount, fee, total, feeNote: note };
    },

    // Admin
    adminDeposits: (_: any, args: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.FINANCE_ADMIN, AdminRole.OPERATIONS_ADMIN);
      return depositWithdrawalService.getAllDeposits(args);
    },

    adminWithdrawals: (_: any, args: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.FINANCE_ADMIN, AdminRole.OPERATIONS_ADMIN);
      return depositWithdrawalService.getAllWithdrawals(args);
    },

    depositStats: (_: any, __: any, ctx: GraphQLContext) => {
      adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.FINANCE_ADMIN);
      return depositWithdrawalService.getDepositStats();
    },
  },

  Mutation: {
    initiatePaystackDeposit: (_: any, { amount, email }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return depositWithdrawalService.initiatePaystackDeposit(user.id, amount, email);
    },

    initiateFlutterwaveDeposit: (_: any, { amount, email, phone, name }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return depositWithdrawalService.initiateFlutterwaveDeposit(user.id, amount, { email, phone, name });
    },

    initiateWithdrawal: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return depositWithdrawalService.initiateWithdrawal(user.id, args);
    },

    adminReverseWithdrawal: async (_: any, { reference }: any, ctx: GraphQLContext) => {
      const admin = adminGuard(ctx, AdminRole.SUPER_ADMIN, AdminRole.FINANCE_ADMIN);
      await depositWithdrawalService.reverseWithdrawal(reference, admin.id);
      return { success: true, message: 'Withdrawal reversed and wallet refunded.' };
    },
  },
};