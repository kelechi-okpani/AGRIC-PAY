import { Ticket, ITicket } from './ticket.model';
import { TicketStatus } from '../../core/types/enums';
import { notificationQueue } from '../../queues';
import { NotFoundError } from '../../core/errors/AppError';
import { User } from '../auth/auth.model';
import { emitToUser } from '../../websocket/socket';
import { whatsAppService } from '../../infrastructure/whatsapp';
import redis from '../../config/redis';

export class SupportService {

  // ── CREATE TICKET ─────────────────────────────────────────
  async createTicket(
    userId: string,
    description: string,
    subject: string = 'Support Request'
  ): Promise<ITicket> {
    const ticket = await Ticket.create({
      userId,
      subject,
      description,
      messages: [{
        senderId:   userId,
        senderType: 'USER',
        content:    description,
        createdAt:  new Date(),
      }],
      channel: 'WHATSAPP',
    });
    return ticket;
  }

  // ── ESCALATE TO HUMAN ─────────────────────────────────────
  async escalateToHuman(userId: string, message: string): Promise<void> {
    // Reuse existing open ticket or create a new one
    let ticket = await Ticket.findOne({
      userId,
      status: { $in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
    });

    
    if (!ticket) {
      ticket = await Ticket.create({
        userId,
        subject: 'WhatsApp Escalation',
        description: message,
        messages: [{
          senderId:   userId,
          senderType: 'USER',
          content:    message,
          createdAt:  new Date(),
        }],
        channel: 'WHATSAPP',
      });
    }

    if (!ticket) {
      throw new Error('Failed to initialize support ticket');
    }

    ticket.status   = TicketStatus.ESCALATED;
    ticket.priority = 'HIGH';
    await ticket.save();

    // Store escalation state in Redis so incoming messages route to agent
    await redis.set(`support:escalated:${userId}`, ticket!._id.toString(), 'EX', 86400);

    // Notify admin panel via WebSocket
    // ticket is ensured to exist above (created if missing) but TS may infer possible null
    emitToUser('admin', 'support:escalated', { ticketId: ticket!._id, userId });
  }

  // ── ROUTE MESSAGE TO AGENT ────────────────────────────────
  async routeToAgent(userId: string, message: string): Promise<void> {
    const ticketId = await redis.get(`support:escalated:${userId}`);
    if (!ticketId) return;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) return;

    ticket.messages.push({
      senderId:   userId as any,
      senderType: 'USER',
      content:    message,
      createdAt:  new Date(),
    });
    await ticket!.save();

    // Push new message notification to assigned agent in real-time
    if (ticket.assignedAgentId) {
      emitToUser(ticket.assignedAgentId.toString(), 'support:new-message', {
        ticketId,
        message,
        userId,
      });
    }
  }

  // ── AGENT REPLY ───────────────────────────────────────────
  async agentReply(ticketId: string, agentId: string, message: string): Promise<void> {
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) throw new NotFoundError('Ticket');

    ticket.messages.push({
      senderId:   agentId as any,
      senderType: 'AGENT',
      content:    message,
      createdAt:  new Date(),
    });
    await ticket.save();

    // Send reply back to user on WhatsApp via Cloud API
    const user = await User.findById(ticket.userId);
    if (user) {
      await whatsAppService.sendText(
        user.phone,
        `👤 *Support Agent:*\n\n${message}`
      );
    }
  }

  // ── ASSIGN TICKET ─────────────────────────────────────────
  async assignTicket(ticketId: string, agentId: string): Promise<ITicket> {
    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { assignedAgentId: agentId, status: TicketStatus.IN_PROGRESS },
      { new: true }
    );
    if (!ticket) throw new NotFoundError('Ticket');
    return ticket;
  }

  // ── CLOSE TICKET ──────────────────────────────────────────
  async closeTicket(ticketId: string, agentId: string): Promise<ITicket> {
    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { status: TicketStatus.CLOSED, resolvedAt: new Date() },
      { new: true }
    );
    if (!ticket) throw new NotFoundError('Ticket');

    // Clear escalation state in Redis
    await redis.del(`support:escalated:${ticket.userId}`);

    // Notify user via WhatsApp Cloud API
    const user = await User.findById(ticket.userId);
    if (user) {
      await whatsAppService.sendText(
        user.phone,
        `✅ *Support Ticket Resolved*\n\nYour support ticket has been resolved by our team.\n\nThank you for using AgroFinPay! If you have further questions, type *HELP* anytime.`
      );
    }

    return ticket;
  }

  // ── ESCALATE EXISTING TICKET (admin action) ───────────────
  async escalateTicket(ticketId: string): Promise<ITicket> {
    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { status: TicketStatus.ESCALATED, priority: 'HIGH' },
      { new: true }
    );
    if (!ticket) throw new NotFoundError('Ticket');

    emitToUser('admin', 'support:escalated', { ticketId, userId: ticket.userId });
    return ticket;
  }

  // ── GET TICKETS (admin) ───────────────────────────────────
  async getTickets(filters: {
    status?:  TicketStatus;
    agentId?: string;
    limit?:   number;
    offset?:  number;
  }) {
    const query: any = {};
    if (filters.status)  query.status           = filters.status;
    if (filters.agentId) query.assignedAgentId  = filters.agentId;

    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate('userId', 'fullName phone')
        .sort({ priority: -1, createdAt: 1 })
        .skip(filters.offset || 0)
        .limit(filters.limit || 20),
      Ticket.countDocuments(query),
    ]);

    return { tickets, total };
  }

  // ── GET USER TICKETS ──────────────────────────────────────
  async getUserTickets(userId: string): Promise<ITicket[]> {
    return Ticket.find({ userId }).sort({ createdAt: -1 }).limit(10);
  }
}

export const supportService = new SupportService();