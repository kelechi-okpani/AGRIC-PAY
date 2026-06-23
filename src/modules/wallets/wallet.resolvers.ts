import { walletService } from './wallet.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';
import { WalletType, TransactionType } from '../../core/types/enums';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const walletResolvers = {
  Query: {
    myWallets: async (_: any, __: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return walletService.getUserWallets(user.id);
    },

    walletBalance: async (_: any, { type }: { type: WalletType }, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return walletService.getBalance(user.id, type);
    },

    transactionHistory: async (
      _: any,
      { type, limit, offset, transactionType }: { type: WalletType; limit?: number; offset?: number; transactionType?: TransactionType },
      ctx: GraphQLContext
    ) => {
      const user = guard(ctx);
      return walletService.getTransactionHistory(user.id, type, { limit, offset, transactionType });
    },
  },

  Mutation: {
    initiateDeposit: async (_: any, { amount, email }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return walletService.initiateDeposit(user.id, amount, email);
    },

    withdraw: async (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return walletService.withdraw(user.id, args);
    },

    freezeWallet: async (_: any, { type, reason }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      await walletService.freezeWallet(user.id, type, reason);
      return { success: true, message: `${type} wallet frozen.` };
    },

    unfreezeWallet: async (_: any, { type }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      await walletService.unfreezeWallet(user.id, type);
      return { success: true, message: `${type} wallet unfrozen.` };
    },
  },
};