import { cryptoService } from './crypto.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const cryptoResolvers = {
  Query: {
    exchangeRates: () => cryptoService.getExchangeRates(),
    cryptoHistory: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cryptoService.getTransactionHistory(user.id, args);
    },
  },
  Mutation: {
    buyCrypto: (_: any, { asset, ngnAmount }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cryptoService.buyCrypto(user.id, asset, ngnAmount);
    },
    sellCrypto: (_: any, { asset, cryptoAmount }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cryptoService.sellCrypto(user.id, asset, cryptoAmount);
    },
    swapCrypto: (_: any, { fromAsset, toAsset, fromAmount }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cryptoService.swapCrypto(user.id, fromAsset, toAsset, fromAmount);
    },
  },
};