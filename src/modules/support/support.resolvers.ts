import { supportService } from './support.service';
import { GraphQLContext } from '../../core/types/context';
import { UnauthorizedError } from '../../core/errors/AppError';
import { Ticket } from './ticket.model';

const guard = (ctx: GraphQLContext) => {
  if (!ctx.user) throw new UnauthorizedError();
  return ctx.user;
};

export const supportResolvers = {
  Query: {
    myTickets: (_: any, __: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return supportService.getUserTickets(user.id);
    },
    ticket: async (_: any, { id }: any, ctx: GraphQLContext) => {
      guard(ctx);
      const ticket = await Ticket.findById(id);
      if (!ticket) throw new Error('Ticket not found');
      return ticket;
    },
    allTickets: (_: any, args: any, ctx: GraphQLContext) => {
      if (!ctx.admin) throw new UnauthorizedError();
      return supportService.getTickets(args);
    },
  },
  Mutation: {
    createTicket: (_: any, { subject, description }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      return supportService.createTicket(user.id, description, subject);
    },
    agentReply: async (_: any, { ticketId, message }: any, ctx: GraphQLContext) => {
      if (!ctx.admin) throw new UnauthorizedError();
      await supportService.agentReply(ticketId, ctx.admin.id, message);
      return { success: true, message: 'Reply sent.' };
    },
    assignTicket: (_: any, { ticketId, agentId }: any, ctx: GraphQLContext) => {
      if (!ctx.admin) throw new UnauthorizedError();
      return supportService.assignTicket(ticketId, agentId);
    },
    closeTicket: (_: any, { ticketId }: any, ctx: GraphQLContext) => {
      if (!ctx.admin) throw new UnauthorizedError();
      return supportService.closeTicket(ticketId, ctx.admin.id);
    },
    escalateTicket: async (_: any, { ticketId }: any, ctx: GraphQLContext) => {
      const user = guard(ctx);
      await supportService.escalateToHuman(user.id, 'User requested escalation');
      const ticket = await Ticket.findByIdAndUpdate(ticketId, { status: 'ESCALATED' }, { new: true });
      return ticket;
    },
  },
};