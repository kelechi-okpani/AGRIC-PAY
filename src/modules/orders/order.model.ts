import mongoose, { Document, Schema } from 'mongoose';
import { OrderStatus } from '../../core/types/enums';

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  unit: string;
  subtotal: number;
}

export interface IOrder extends Document {
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  items: IOrderItem[];
  totalAmount: number;
  deliveryFee: number;
  status: OrderStatus;
  reference: string;
  deliveryAddress: string;
  deliveryAgentId?: mongoose.Types.ObjectId;
  proofOfDeliveryUrl?: string;
  estimatedDeliveryDate?: Date;
  deliveredAt?: Date;
  cancelReason?: string;
  paymentReference?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [{
      productId: { type: Schema.Types.ObjectId, ref: 'Product' },
      name: String,
      price: Number,
      quantity: Number,
      unit: String,
      subtotal: Number,
    }],
    totalAmount: { type: Number, required: true },
    deliveryFee: { type: Number, default: 500 },
    status: { type: String, enum: Object.values(OrderStatus), default: OrderStatus.PENDING },
    reference: { type: String, required: true, unique: true },
    deliveryAddress: { type: String, required: true },
    deliveryAgentId: { type: Schema.Types.ObjectId, ref: 'User' },
    proofOfDeliveryUrl: { type: String },
    estimatedDeliveryDate: { type: Date },
    deliveredAt: { type: Date },
    cancelReason: { type: String },
    paymentReference: { type: String },
  },
  { timestamps: true }
);

export const Order = mongoose.model<IOrder>('Order', OrderSchema);