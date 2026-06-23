import { userService } from './user.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const userResolvers = {
  Query: {
    me: (_: any, __: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return userService.getUserWithProfile(user.id);
    },
    myProfile: (_: any, __: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return userService.getOrCreateProfile(user.id);
    },
    myBeneficiaries: async (_: any, __: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      const profile = await userService.getOrCreateProfile(user.id);
      return profile.beneficiaries;
    },
  },
  Mutation: {
    updateProfile: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return userService.updateProfile(user.id, args);
    },
    uploadAvatar: async (_: any, { base64Image }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      const url = await userService.uploadAvatar(user.id, base64Image);
      return { success: true, message: url };
    },
    addBeneficiary: (_: any, { beneficiary }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return userService.addBeneficiary(user.id, beneficiary);
    },
    removeBeneficiary: (_: any, { accountNumber }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return userService.removeBeneficiary(user.id, accountNumber);
    },
    updateNotificationPreferences: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return userService.updateNotificationPreferences(user.id, args);
    },
    linkBankAccount: (_: any, args: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return userService.linkBankAccount(user.id, args);
    },
  },
};