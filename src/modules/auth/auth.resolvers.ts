import { authService } from './auth.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';

export const authResolvers = {
  Query: {
    sessions: async (_: any, __: any, ctx: GraphQLContext) => {
      if (!ctx.user) throw new UnauthorizedError();
      return authService.getSessions(ctx.user.id);
    },
  },

  Mutation: {
    register: async (_: any, args: any) => authService.register(args),

    verifyOtp: async (_: any, args: any, ctx: GraphQLContext) =>
      authService.verifyOtp({ ...args, ip: ctx.req.ip }),

    login: async (_: any, args: any, ctx: GraphQLContext) =>
      authService.login({ ...args, ip: ctx.req.ip }),

    refreshToken: async (_: any, { refreshToken }: any) =>
      authService.refreshToken(refreshToken),

    forgotPassword: async (_: any, { phone }: any) =>
      authService.forgotPassword(phone),

    resetPassword: async (_: any, args: any) =>
      authService.resetPassword(args),

    resendOtp: async (_: any, { phone }: any) =>
      authService.resendOTP(phone),

    setup2FA: async (_: any, __: any, ctx: GraphQLContext) => {
      if (!ctx.user) throw new UnauthorizedError();
      return authService.setup2FA(ctx.user.id);
    },

    enable2FA: async (_: any, { token }: any, ctx: GraphQLContext) => {
      if (!ctx.user) throw new UnauthorizedError();
      await authService.enable2FA(ctx.user.id, token);
      return { success: true, message: '2FA enabled.' };
    },

    verify2FA: async (_: any, { userId, token }: any) =>
      authService.verify2FA(userId, token),

    logout: async (_: any, __: any, ctx: GraphQLContext) => {
      if (!ctx.user) throw new UnauthorizedError();
      await authService.logout(ctx.user.id);
      return { success: true, message: 'Logged out.' };
    },

    revokeSession: async (_: any, { deviceId }: any, ctx: GraphQLContext) => {
      if (!ctx.user) throw new UnauthorizedError();
      await authService.revokeSession(ctx.user.id, deviceId);
      return { success: true, message: 'Session revoked.' };
    },
  },
};