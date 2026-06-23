import { orderService } from './order.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';
import { OrderStatus } from '../../core/types/enums';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const orderResolvers = {
  Query: {
    order: (_: any, { id }: any, ctx: GraphQLContext) => {
      guard(ctx);
      return orderService.getOrder(id);
    },
    myOrders: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return orderService.getUserOrders(user.id, 'buyer', args);
    },
    mySalesOrders: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return orderService.getUserOrders(user.id, 'seller', args);
    },
  },
  Mutation: {
    placeOrder: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return orderService.placeOrder(user.id, args);
    },
    confirmOrder: (_: any, { orderId }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return orderService.confirmOrder(orderId, user.id);
    },
    cancelOrder: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return orderService.cancelOrder(args.orderId, user.id, args.reason);
    },
    updateOrderStatus: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return orderService.updateOrderStatus(args.orderId, user.id, args.status, args.proofUrl);
    },
    assignDeliveryAgent: (_: any, args: any, ctx: GraphQLContext) => {
      if (!ctx.admin) throw new UnauthorizedError();
      return orderService.assignDeliveryAgent(args.orderId, args.agentId);
    },
  },
};