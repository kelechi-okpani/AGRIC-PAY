import { Ticket, ITicket } from './ticket.model';
import { TicketStatus } from '../../core/types/enums';
import { twilioService } from '../../infrastructure/twilio';
import { notificationQueue } from '../../queues';
import { NotFoundError } from '../../core/errors/AppError';
import { User } from '../auth/auth.model';
import { emitToUser } from '../../websocket/socket';
import redis from '../../config/redis';

export class SupportService {

  async createTicket(userId: string, description: string, subject: string = 'Support Request'): Promise<ITicket | any> {
    const ticket = await Ticket.create({
      userId,
      subject,
      description,
      messages: [{ senderId: userId, senderType: 'USER', content: description, createdAt: new Date() }],
      channel: 'WHATSAPP',
    });
    return ticket;
  }

  async escalateToHuman(userId: string, message: string): Promise<void> {
    let ticket:any = await Ticket.findOne({ userId, status: { $in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] } });

    if (!ticket) {
      ticket = await this.createTicket(userId, message, 'WhatsApp Escalation');
    }

    ticket.status = TicketStatus.ESCALATED;
    ticket.priority = 'HIGH';
    await ticket.save();

    await redis.set(`support:escalated:${userId}`, ticket._id.toString(), 'EX', 86400);
    emitToUser('admin', 'support:escalated', { ticketId: ticket._id, userId });
  }

  async routeToAgent(userId: string, message: string): Promise<void> {
    const ticketId = await redis.get(`support:escalated:${userId}`);
    if (!ticketId) return;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) return;

    ticket.messages.push({ senderId: userId as any, senderType: 'USER', content: message, createdAt: new Date() });
    await ticket.save();

    if (ticket.assignedAgentId) {
      emitToUser(ticket.assignedAgentId.toString(), 'support:new-message', { ticketId, message });
    }
  }

  async agentReply(ticketId: string, agentId: string, message: string): Promise<void> {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket');

    ticket.messages.push({ senderId: agentId as any, senderType: 'AGENT', content: message, createdAt: new Date() });
    await ticket.save();

    const user = await User.findById(ticket.userId);
    if (user) {
      await twilioService.sendWhatsApp(user.phone, `👤 Support Agent: ${message}`);
    }
  }

  async assignTicket(ticketId: string, agentId: string): Promise<ITicket> {
    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { assignedAgentId: agentId, status: TicketStatus.IN_PROGRESS },
      { new: true }
    );
    if (!ticket) throw new NotFoundError('Ticket');
    return ticket;
  }

  async closeTicket(ticketId: string, agentId: string): Promise<ITicket> {
    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { status: TicketStatus.CLOSED, resolvedAt: new Date() },
      { new: true }
    );
    if (!ticket) throw new NotFoundError('Ticket');

    await redis.del(`support:escalated:${ticket.userId}`);

    const user = await User.findById(ticket.userId);
    if (user) {
      await twilioService.sendWhatsApp(user.phone, `✅ Your support ticket has been resolved. Thank you for using AgroFinPay!`);
    }

    return ticket;
  }

  async getTickets(filters: { status?: TicketStatus; agentId?: string; limit?: number; offset?: number }) {
    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.agentId) query.assignedAgentId = filters.agentId;

    const [tickets, total] = await Promise.all([
      Ticket.find(query).populate('userId', 'fullName phone').sort({ priority: -1, createdAt: 1 }).skip(filters.offset || 0).limit(filters.limit || 20),
      Ticket.countDocuments(query),
    ]);

    return { tickets, total };
  }

  async getUserTickets(userId: string) {
    return Ticket.find({ userId }).sort({ createdAt: -1 }).limit(10);
  }
}

export const supportService = new SupportService();