import { deliveryService } from './delivery.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const deliveryResolvers = {
  Query: {
    orderDelivery: (_: any, { orderId }: any, ctx: GraphQLContext) => {
      guard(ctx);
      return deliveryService.getDelivery(orderId);
    },
    myDeliveries: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return deliveryService.getAgentDeliveries(user.id, args);
    },
  },
  Mutation: {
    updateDeliveryStatus: (_: any, { deliveryId, status, notes }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return deliveryService.updateStatus(deliveryId, user.id, status, notes);
    },
    submitProofOfDelivery: (_: any, { deliveryId, imageBase64 }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return deliveryService.submitProofOfDelivery(deliveryId, user.id, imageBase64);
    },
  },
};