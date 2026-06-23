import { transferService } from './transfer.service';
import { paystackService } from '../../infrastructure/paystack';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';
import { TransferStatus } from '../../core/types/enums';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const transferResolvers = {
  Query: {
    myTransfers: async (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return transferService.getUserTransfers(user.id, args);
    },

    transfer: async (_: any, { id }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return transferService.getTransferById(id, user.id);
    },

    banks: async () => paystackService.getBanks(),

    resolveAccount: async (_: any, { accountNumber, bankCode }: any) =>
      paystackService.resolveAccountNumber(accountNumber, bankCode),
  },

  Mutation: {
    internalTransfer: async (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return transferService.internalTransfer(user.id, args);
    },

    bankTransfer: async (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return transferService.bankTransfer(user.id, args);
    },

    scheduleTransfer: async (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return transferService.scheduleTransfer(user.id, { ...args, scheduledAt: new Date(args.scheduledAt) });
    },

    createRecurringTransfer: async (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return transferService.createRecurringTransfer(user.id, { ...args, endDate: new Date(args.endDate) });
    },

    retryTransfer: async (_: any, { id }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return transferService.retryTransfer(id, user.id);
    },

    cancelTransfer: async (_: any, { id }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return transferService.cancelTransfer(id, user.id);
    },
  },
};