import { Delivery, IDelivery } from './delivery.model';
import { Order } from '../orders/order.model';
import { OrderStatus } from '../../core/types/enums';
import { notificationQueue } from '../../queues';
import { cloudinaryService } from '../../infrastructure/cloudinary';
import { NotFoundError, ValidationError } from '../../core/errors/AppError';

export class DeliveryService {

  async createDelivery(orderId: string, agentId: string): Promise<IDelivery> {
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order');

    const delivery = await Delivery.create({
      orderId,
      agentId,
      pickupAddress: 'Merchant Address',
      deliveryAddress: order.deliveryAddress,
      deliveryFee: order.deliveryFee,
    });

    return delivery;
  }

  async updateStatus(deliveryId: string, agentId: string, status: IDelivery['status'], notes?: string): Promise<IDelivery> {
    const delivery = await Delivery.findOne({ _id: deliveryId, agentId });
    if (!delivery) throw new NotFoundError('Delivery');

    delivery.status = status;
    delivery.agentNotes = notes;

    if (status === 'PICKED_UP') delivery.pickedUpAt = new Date();
    if (status === 'DELIVERED') delivery.deliveredAt = new Date();

    await delivery.save();

    const order = await Order.findById(delivery.orderId);
    if (order) {
      await notificationQueue.add('delivery-update', {
        userId: order.buyerId.toString(),
        channel: 'WHATSAPP',
        message: `📦 Delivery update for order ${order.reference}:\nStatus: *${status}*${notes ? `\nNote: ${notes}` : ''}`,
      });
    }

    return delivery;
  }

  async submitProofOfDelivery(deliveryId: string, agentId: string, imageBase64: string): Promise<IDelivery> {
    const delivery = await Delivery.findOne({ _id: deliveryId, agentId });
    if (!delivery) throw new NotFoundError('Delivery');

    const imageUrl = await cloudinaryService.uploadBase64(imageBase64, `deliveries/${deliveryId}/proof`);
    delivery.proofImageUrl = imageUrl;
    delivery.status = 'DELIVERED';
    delivery.deliveredAt = new Date();

    await delivery.save();

    // Update order status
    await Order.findByIdAndUpdate(delivery.orderId, { status: OrderStatus.DELIVERED, proofOfDeliveryUrl: imageUrl });

    return delivery;
  }

  async getDelivery(orderId: string): Promise<IDelivery | null> {
    return Delivery.findOne({ orderId }).populate('agentId', 'fullName phone');
  }

  async getAgentDeliveries(agentId: string, filters: { status?: string; limit?: number; offset?: number }) {
    const query: any = { agentId };
    if (filters.status) query.status = filters.status;

    const [deliveries, total] = await Promise.all([
      Delivery.find(query).populate('orderId').sort({ createdAt: -1 }).skip(filters.offset || 0).limit(filters.limit || 20),
      Delivery.countDocuments(query),
    ]);

    return { deliveries, total };
  }
}

export const deliveryService = new DeliveryService();