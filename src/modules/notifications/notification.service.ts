import { Notification, INotification } from './notification.model';
import { twilioService } from '../../infrastructure/twilio';
import { User } from '../auth/auth.model';
import { emitToUser } from '../../websocket/socket';
import { logger } from '../../shared/utils/logger';

export class NotificationService {

  async send(data: {
    userId: string;
    title: string;
    message: string;
    channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'PUSH';
    type: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const user = await User.findById(data.userId);
    if (!user) return;

    await Notification.create({
      userId: data.userId,
      title: data.title,
      message: data.message,
      channel: data.channel,
      type: data.type,
      metadata: data.metadata,
    });

    switch (data.channel) {
      case 'WHATSAPP':
        await twilioService.sendWhatsApp(user.phone, data.message);
        break;
      case 'SMS':
        await twilioService.sendSMS(user.phone, data.message);
        break;
      case 'PUSH':
        emitToUser(data.userId, 'notification', { title: data.title, message: data.message });
        break;
      default:
        logger.warn(`[Notification] Unhandled channel: ${data.channel}`);
    }
  }

  async getUserNotifications(userId: string, filters: { limit?: number; offset?: number; unreadOnly?: boolean }) {
    const query: any = { userId };
    if (filters.unreadOnly) query.isRead = false;

    const [notifications, total] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(filters.offset || 0).limit(filters.limit || 20),
      Notification.countDocuments(query),
    ]);

    return { notifications, total };
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    await Notification.findOneAndUpdate({ _id: notificationId, userId }, { isRead: true });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await Notification.updateMany({ userId, isRead: false }, { isRead: true });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({ userId, isRead: false });
  }
}

export const notificationService = new NotificationService();