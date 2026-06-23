import { businessService } from './business.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';
import { AdminRole } from '../../core/types/enums';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const businessResolvers = {
  Query: {
    myBusiness: (_: any, __: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return businessService.getBusiness(user.id);
    },
    allBusinesses: (_: any, args: any, ctx: GraphQLContext) => {
      if (!ctx.admin) throw new UnauthorizedError();
      return businessService.getAllBusinesses(args);
    },
  },
  Mutation: {
    createBusiness: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return businessService.createBusiness(user.id, args);
    },
    updateBusiness: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return businessService.updateBusiness(user.id, args);
    },
    addEmployee: (_: any, { employee }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return businessService.addEmployee(user.id, employee);
    },
    removeEmployee: (_: any, { accountNumber }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return businessService.removeEmployee(user.id, accountNumber);
    },
    runPayroll: (_: any, __: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return businessService.runPayroll(user.id);
    },
    approveBusiness: (_: any, { businessId }: any, ctx: GraphQLContext) => {
      if (!ctx.admin) throw new UnauthorizedError();
      return businessService.approveBusiness(businessId, ctx.admin.id);
    },
    rejectBusiness: (_: any, { businessId, reason }: any, ctx: GraphQLContext) => {
      if (!ctx.admin) throw new UnauthorizedError();
      return businessService.rejectBusiness(businessId, reason);
    },
    suspendBusiness: (_: any, { businessId }: any, ctx: GraphQLContext) => {
      if (!ctx.admin) throw new UnauthorizedError();
      return businessService.suspendBusiness(businessId);
    },
  },
};