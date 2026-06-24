
import { eventBus, Events } from '../EventBus';
import { notificationQueue } from '../../queues';
import { logger } from '../../shared/utils/logger';
import { Order } from '../../modules/orders/order.model';
import { User } from '../../modules/auth/auth.model';

// ── ORDER PLACED ──────────────────────────────────────────────────────────────
eventBus.on(Events.ORDER_PLACED, async ({ orderId, buyerId, sellerId }) => {
  logger.info(`[Event] Order placed: ${orderId}`);

  const [buyer, seller] = await Promise.all([
    User.findById(buyerId),
    User.findById(sellerId),
  ]);

  // Notify buyer
  if (buyer) {
    await notificationQueue.add('order-placed-buyer', {
      phone:   buyer.phone,
      channel: 'WHATSAPP',
      message:
        `🛒 *Order Placed!*\n\n` +
        `Your order has been placed successfully.\n` +
        `We'll notify you once the seller confirms.\n\n` +
        `Reply *MY ORDERS* to track your order.`,
    });
  }

  // Notify seller
  if (seller) {
    await notificationQueue.add('order-placed-seller', {
      phone:   seller.phone,
      channel: 'WHATSAPP',
      message:
        `📦 *New Order Received!*\n\n` +
        `Order ID: ${orderId}\n` +
        `Buyer: ${buyer?.fullName || 'A customer'}\n\n` +
        `Reply *CONFIRM ${orderId}* to confirm this order.`,
    });
  }
});

// ── ORDER CONFIRMED ───────────────────────────────────────────────────────────
eventBus.on(Events.ORDER_CONFIRMED, async ({ orderId, buyerId }) => {
  logger.info(`[Event] Order confirmed: ${orderId}`);

  const [order, buyer] = await Promise.all([
    Order.findById(orderId),
    User.findById(buyerId),
  ]);

  if (buyer && order) {
    await notificationQueue.add('order-confirmed-notification', {
      phone:   buyer.phone,
      channel: 'WHATSAPP',
      message:
        `✅ *Order Confirmed!*\n\n` +
        `Ref: ${order.reference}\n` +
        `Estimated delivery: ${order.estimatedDeliveryDate?.toDateString() || 'Soon'}\n\n` +
        `Reply *MY ORDERS* to track your delivery.`,
    });
  }
});

// ── ORDER DELIVERED ───────────────────────────────────────────────────────────
eventBus.on(Events.ORDER_DELIVERED, async ({ orderId }) => {
  logger.info(`[Event] Order delivered: ${orderId}`);

  const order = await Order.findById(orderId);
  if (!order) return;

  const buyer = await User.findById(order.buyerId);
  if (buyer) {
    await notificationQueue.add('order-delivered-notification', {
      phone:   buyer.phone,
      channel: 'WHATSAPP',
      message:
        `🎉 *Order Delivered!*\n\n` +
        `Your order ${order.reference} has been delivered!\n\n` +
        `Rate your experience by replying:\n` +
        `*RATE ${order.reference} 5* — for 5 stars\n` +
        `or any number from 1-5.`,
    });
  }
});
// import { eventBus, Events } from '../EventBus';
// import { notificationQueue } from '../../queues';
// import { logger } from '../../shared/utils/logger';
// import { Order } from '../../modules/orders/order.model';
// import { User } from '../../modules/auth/auth.model';

// eventBus.on(Events.ORDER_PLACED, async ({ orderId, buyerId, sellerId }) => {
//   logger.info(`[Event] Order placed: ${orderId}`);

//   const [buyer, seller] = await Promise.all([
//     User.findById(buyerId),
//     User.findById(sellerId),
//   ]);

//   await notificationQueue.add('order-placed-sms', {
//     phone: buyer?.phone,
//     channel: 'SMS',
//     message: `AgroFinPay: Your order has been placed successfully. Ref: ${orderId}`,
//   });
// });

// eventBus.on(Events.ORDER_CONFIRMED, async ({ orderId, buyerId }) => {
//   logger.info(`[Event] Order confirmed: ${orderId}`);

//   const order = await Order.findById(orderId);
//   if (!order) return;

//   await notificationQueue.add('order-confirmed-notification', {
//     userId: buyerId,
//     channel: 'WHATSAPP',
//     message: `✅ Order ${order.reference} confirmed! Estimated delivery: ${order.estimatedDeliveryDate?.toDateString()}`,
//   });
// });

// eventBus.on(Events.ORDER_DELIVERED, async ({ orderId }) => {
//   logger.info(`[Event] Order delivered: ${orderId}`);

//   const order = await Order.findById(orderId);
//   if (!order) return;

//   await notificationQueue.add('order-delivered-notification', {
//     userId: order.buyerId.toString(),
//     channel: 'WHATSAPP',
//     message: `📦 Order ${order.reference} has been delivered! Rate your experience by replying *RATE ${order.reference}*.`,
//   });
// });