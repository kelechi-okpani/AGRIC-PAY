import { v4 as uuidv4 } from 'uuid';
import { Order, IOrder } from './order.model';
import { Product } from '../products/product.model';
import { OrderStatus, WalletType } from '../../core/types/enums';
import { walletService } from '../wallets/wallet.service';
import { notificationQueue } from '../../queues';
import { eventBus, Events } from '../../events/EventBus';
import { AppError, NotFoundError, ValidationError } from '../../core/errors/AppError';
import { User } from '../auth/auth.model';

export class OrderService {

  async placeOrder(buyerId: string, data: {
    items: { productId: string; quantity: number }[];
    deliveryAddress: string;
  }): Promise<IOrder> {
    const orderItems = [];
    let totalAmount = 0;
    let sellerId: string | null = null;

    for (const item of data.items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive || !product.isApproved) throw new NotFoundError(`Product ${item.productId}`);
      if (product.quantity < item.quantity) throw new ValidationError(`Insufficient stock for ${product.name}`);

      if (!sellerId) sellerId = product.merchantId.toString();
      else if (sellerId !== product.merchantId.toString()) throw new ValidationError('All items must be from the same merchant');

      const subtotal = product.price * item.quantity;
      totalAmount += subtotal;
      orderItems.push({ productId: product._id, name: product.name, price: product.price, quantity: item.quantity, unit: product.unit, subtotal });
    }

    const deliveryFee = 500;
    const grandTotal = totalAmount + deliveryFee;
    const reference = `ORD-${uuidv4()}`;

    // Debit buyer wallet (escrow)
    await walletService.debit(buyerId, WalletType.NGN, grandTotal, `Order payment — ${reference}`, { reference });

    // Reduce product stock
    for (const item of data.items) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: -item.quantity } });
    }

    const order = await Order.create({
      buyerId,
      sellerId,
      items: orderItems,
      totalAmount: grandTotal,
      deliveryFee,
      reference,
      deliveryAddress: data.deliveryAddress,
      paymentReference: reference,
    });

    eventBus.emit(Events.ORDER_PLACED, { orderId: order._id, buyerId, sellerId });

    const seller = await User.findById(sellerId);
    const buyer = await User.findById(buyerId);

    await notificationQueue.add('order-placed-seller', {
      userId: sellerId,
      channel: 'WHATSAPP',
      message: `🛒 New order received!\nOrder: ${reference}\nAmount: ₦${grandTotal.toLocaleString()}\n\nReply *CONFIRM ${reference}* to confirm.`,
    });

    await notificationQueue.add('order-placed-buyer', {
      userId: buyerId,
      channel: 'WHATSAPP',
      message: `✅ Your order has been placed!\nRef: ${reference}\nTotal: ₦${grandTotal.toLocaleString()}\n\nWe'll notify you when the seller confirms.`,
    });

    return order;
  }

  async confirmOrder(orderId: string, sellerId: string): Promise<IOrder> {
    const order = await Order.findOne({ _id: orderId, sellerId });
    if (!order) throw new NotFoundError('Order');
    if (order.status !== OrderStatus.PENDING) throw new ValidationError('Order cannot be confirmed in current state');

    order.status = OrderStatus.CONFIRMED;
    order.estimatedDeliveryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await order.save();

    await notificationQueue.add('order-confirmed', {
      userId: order.buyerId.toString(),
      channel: 'WHATSAPP',
      message: `🎉 Your order ${order.reference} has been confirmed!\nEstimated delivery: ${order.estimatedDeliveryDate?.toDateString()}`,
    });

    return order;
  }

  async updateOrderStatus(orderId: string, agentId: string, status: OrderStatus, proofUrl?: string): Promise<IOrder> {
    const order = await Order.findOne({ _id: orderId, deliveryAgentId: agentId });
    if (!order) throw new NotFoundError('Order');

    order.status = status;
    if (status === OrderStatus.DELIVERED) {
      order.deliveredAt = new Date();
      order.proofOfDeliveryUrl = proofUrl;

      // Release payment to seller
      await walletService.credit(
        order.sellerId.toString(),
        WalletType.NGN,
        order.totalAmount - order.deliveryFee,
        `Payment for order ${order.reference}`,
        { reference: order.reference }
      );

      eventBus.emit(Events.ORDER_DELIVERED, { orderId: order._id });

      await notificationQueue.add('order-delivered', {
        userId: order.buyerId.toString(),
        channel: 'WHATSAPP',
        message: `📦 Your order ${order.reference} has been delivered!\n\nRate your experience by replying *RATE ${order.reference}*.`,
      });
    }

    await order.save();
    return order;
  }

  async cancelOrder(orderId: string, userId: string, reason: string): Promise<IOrder> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order');

    const isBuyer = order.buyerId.toString() === userId;
    const isSeller = order.sellerId.toString() === userId;
    if (!isBuyer && !isSeller) throw new AppError('Unauthorized', 403);

    if (![OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(order.status)) {
      throw new ValidationError('Order cannot be cancelled in current state');
    }

    order.status = OrderStatus.CANCELLED;
    order.cancelReason = reason;
    await order.save();

    // Refund buyer
    await walletService.credit(order.buyerId.toString(), WalletType.NGN, order.totalAmount, `Refund for cancelled order ${order.reference}`, { reference: order.reference });

    // Restore stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.productId, { $inc: { quantity: item.quantity } });
    }

    await notificationQueue.add('order-cancelled', {
      userId: order.buyerId.toString(),
      channel: 'WHATSAPP',
      message: `❌ Order ${order.reference} has been cancelled.\nRefund of ₦${order.totalAmount.toLocaleString()} has been returned to your wallet.`,
    });

    return order;
  }

  async assignDeliveryAgent(orderId: string, agentId: string): Promise<IOrder> {
    const order = await Order.findByIdAndUpdate(orderId, { deliveryAgentId: agentId, status: OrderStatus.DISPATCHED }, { new: true });
    if (!order) throw new NotFoundError('Order');

    await notificationQueue.add('order-dispatched', {
      userId: order.buyerId.toString(),
      channel: 'WHATSAPP',
      message: `🚚 Your order ${order.reference} is on its way! A delivery agent has been assigned.`,
    });

    return order;
  }

  async getOrder(orderId: string): Promise<IOrder> {
    const order = await Order.findById(orderId).populate('buyerId sellerId deliveryAgentId', 'fullName phone');
    if (!order) throw new NotFoundError('Order');
    return order;
  }

  async getUserOrders(userId: string, role: 'buyer' | 'seller', filters: { status?: OrderStatus; limit?: number; offset?: number }) {
    const query: any = role === 'buyer' ? { buyerId: userId } : { sellerId: userId };
    if (filters.status) query.status = filters.status;

    const [orders, total] = await Promise.all([
      Order.find(query).sort({ createdAt: -1 }).skip(filters.offset || 0).limit(filters.limit || 20),
      Order.countDocuments(query),
    ]);

    return { orders, total };
  }
}

export const orderService = new OrderService();