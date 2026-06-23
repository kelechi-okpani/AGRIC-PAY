import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'PUSH';
  isRead: boolean;
  type: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    channel: { type: String, enum: ['WHATSAPP', 'SMS', 'EMAIL', 'PUSH'], required: true },
    isRead: { type: Boolean, default: false },
    type: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);