import { eventBus, Events } from '../EventBus';
import { notificationQueue } from '../../queues';
import { logger } from '../../shared/utils/logger';
import { Order } from '../../modules/orders/order.model';
import { User } from '../../modules/auth/auth.model';

eventBus.on(Events.ORDER_PLACED, async ({ orderId, buyerId, sellerId }) => {
  logger.info(`[Event] Order placed: ${orderId}`);

  const [buyer, seller] = await Promise.all([
    User.findById(buyerId),
    User.findById(sellerId),
  ]);

  await notificationQueue.add('order-placed-sms', {
    phone: buyer?.phone,
    channel: 'SMS',
    message: `AgroFinPay: Your order has been placed successfully. Ref: ${orderId}`,
  });
});

eventBus.on(Events.ORDER_CONFIRMED, async ({ orderId, buyerId }) => {
  logger.info(`[Event] Order confirmed: ${orderId}`);

  const order = await Order.findById(orderId);
  if (!order) return;

  await notificationQueue.add('order-confirmed-notification', {
    userId: buyerId,
    channel: 'WHATSAPP',
    message: `✅ Order ${order.reference} confirmed! Estimated delivery: ${order.estimatedDeliveryDate?.toDateString()}`,
  });
});

eventBus.on(Events.ORDER_DELIVERED, async ({ orderId }) => {
  logger.info(`[Event] Order delivered: ${orderId}`);

  const order = await Order.findById(orderId);
  if (!order) return;

  await notificationQueue.add('order-delivered-notification', {
    userId: order.buyerId.toString(),
    channel: 'WHATSAPP',
    message: `📦 Order ${order.reference} has been delivered! Rate your experience by replying *RATE ${order.reference}*.`,
  });
});