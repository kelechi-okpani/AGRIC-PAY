import mongoose, { Document, Schema } from 'mongoose';
import { TicketStatus } from '../../core/types/enums';

export interface IMessage {
  senderId: mongoose.Types.ObjectId;
  senderType: 'USER' | 'AGENT' | 'AI';
  content: string;
  createdAt: Date;
}

export interface ITicket extends Document {
  userId: mongoose.Types.ObjectId;
  subject: string;
  description: string;
  status: TicketStatus;
  assignedAgentId?: mongoose.Types.ObjectId;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  messages: IMessage[];
  channel: 'WHATSAPP' | 'WEB';
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TicketSchema = new Schema<ITicket>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: Object.values(TicketStatus), default: TicketStatus.OPEN },
    assignedAgentId: { type: Schema.Types.ObjectId, ref: 'Admin' },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
    messages: [{
      senderId: { type: Schema.Types.ObjectId },
      senderType: { type: String, enum: ['USER', 'AGENT', 'AI'] },
      content: { type: String },
      createdAt: { type: Date, default: Date.now },
    }],
    channel: { type: String, enum: ['WHATSAPP', 'WEB'], default: 'WHATSAPP' },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

export const Ticket = mongoose.model<ITicket>('Ticket', TicketSchema);