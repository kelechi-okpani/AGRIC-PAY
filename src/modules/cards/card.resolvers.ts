import { cardService } from './card.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const cardResolvers = {
  Query: {
    myCards: (_: any, __: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cardService.getUserCards(user.id);
    },
    cardTransactions: (_: any, { cardId, from, to }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cardService.getCardTransactions(user.id, cardId, from, to);
    },
  },
  Mutation: {
    createCard: (_: any, __: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cardService.createCard(user.id);
    },
    fundCard: (_: any, { cardId, amountUSD }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cardService.fundCard(user.id, cardId, amountUSD);
    },
    freezeCard: (_: any, { cardId }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cardService.freezeCard(user.id, cardId);
    },
    unfreezeCard: (_: any, { cardId }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cardService.unfreezeCard(user.id, cardId);
    },
    terminateCard: (_: any, { cardId }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return cardService.terminateCard(user.id, cardId);
    },
  },
};