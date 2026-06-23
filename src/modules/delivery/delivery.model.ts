import mongoose, { Document, Schema } from 'mongoose';

export interface IDelivery extends Document {
  orderId: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  status: 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  pickupAddress: string;
  deliveryAddress: string;
  estimatedDistance?: number;
  deliveryFee: number;
  proofImageUrl?: string;
  agentNotes?: string;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeliverySchema = new Schema<IDelivery>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED'], default: 'ASSIGNED' },
    pickupAddress: { type: String, required: true },
    deliveryAddress: { type: String, required: true },
    estimatedDistance: { type: Number },
    deliveryFee: { type: Number, required: true, default: 500 },
    proofImageUrl: { type: String },
    agentNotes: { type: String },
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },
    failureReason: { type: String },
  },
  { timestamps: true }
);

export const Delivery = mongoose.model<IDelivery>('Delivery', DeliverySchema);