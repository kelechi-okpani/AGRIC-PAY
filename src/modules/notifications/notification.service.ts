import { Notification, INotification } from './notification.model';
import { whatsAppService }             from '../../infrastructure/whatsapp';
import { User }                        from '../auth/auth.model';
import { emitToUser }                  from '../../websocket/socket';
import { logger }                      from '../../shared/utils/logger';

export class NotificationService {

  // ── SEND NOTIFICATION ─────────────────────────────────────────────
  async send(data: {
    userId:    string;
    title:     string;
    message:   string;
    channel:   'WHATSAPP' | 'SMS' | 'EMAIL' | 'PUSH';
    type:      string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const user = await User.findById(data.userId);
    if (!user) {
      logger.warn(`[Notification] User not found: ${data.userId}`);
      return;
    }

    // Persist notification record
    await Notification.create({
      userId:   data.userId,
      title:    data.title,
      message:  data.message,
      channel:  data.channel,
      type:     data.type,
      metadata: data.metadata,
    });

    // Dispatch via the correct channel
    switch (data.channel) {

      case 'WHATSAPP':
        await whatsAppService.sendText(user.phone, data.message);
        break;

      case 'SMS':
        // SMS fallback — plug in Termii or Africa's Talking here if needed
        // For now log a warning since we're WhatsApp-first
        logger.warn(
          `[Notification] SMS channel not configured. ` +
          `Message for user=${data.userId} was not delivered via SMS.`
        );
        break;

      case 'PUSH':
        // Real-time push via Socket.io to the admin panel or a future mobile app
        emitToUser(data.userId, 'notification', {
          title:   data.title,
          message: data.message,
          type:    data.type,
        });
        break;

      case 'EMAIL':
        // Email — plug in Resend, Sendgrid, or Nodemailer here
        logger.warn(
          `[Notification] EMAIL channel not yet configured for user=${data.userId}.`
        );
        break;

      default:
        logger.warn(`[Notification] Unknown channel: ${data.channel}`);
    }
  }

  // ── SEND TO PHONE DIRECTLY (no userId lookup needed) ─────────────
  async sendToPhone(
    phone:   string,
    message: string,
    channel: 'WHATSAPP' | 'SMS' = 'WHATSAPP'
  ): Promise<void> {
    if (channel === 'WHATSAPP') {
      await whatsAppService.sendText(phone, message);
    } else {
      logger.warn(`[Notification] SMS not configured. Could not send to ${phone}.`);
    }
  }

  // ── GET USER NOTIFICATIONS ────────────────────────────────────────
  async getUserNotifications(
    userId:  string,
    filters: { limit?: number; offset?: number; unreadOnly?: boolean }
  ) {
    const query: any = { userId };
    if (filters.unreadOnly) query.isRead = false;

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(filters.offset || 0)
        .limit(filters.limit || 20),
      Notification.countDocuments(query),
    ]);

    return { notifications, total };
  }

  // ── MARK SINGLE NOTIFICATION AS READ ─────────────────────────────
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    await Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { isRead: true }
    );
  }

  // ── MARK ALL AS READ ──────────────────────────────────────────────
  async markAllAsRead(userId: string): Promise<void> {
    await Notification.updateMany({ userId, isRead: false }, { isRead: true });
  }

  // ── GET UNREAD COUNT ──────────────────────────────────────────────
  async getUnreadCount(userId: string): Promise<number> {
    return Notification.countDocuments({ userId, isRead: false });
  }

  // ── DELETE OLD NOTIFICATIONS ──────────────────────────────────────
  async deleteOldNotifications(userId: string, olderThanDays: number = 30): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    await Notification.deleteMany({ userId, createdAt: { $lt: cutoff } });
  }
}

export const notificationService = new NotificationService();