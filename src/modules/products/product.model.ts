import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  merchantId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  category: string;
  price: number;
  unit: string;
  quantity: number;
  images: string[];
  isActive: boolean;
  isApproved: boolean;
  tags: string[];
  location: string;
  ratings: { userId: mongoose.Types.ObjectId; score: number; review?: string; createdAt: Date }[];
  averageRating: number;
  totalSold: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    merchantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, index: 'text' },
    description: { type: String, required: true },
    category: { type: String, required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    images: [{ type: String }],
    isActive: { type: Boolean, default: true },
    isApproved: { type: Boolean, default: false },
    tags: [{ type: String }],
    location: { type: String },
    ratings: [{
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      score: { type: Number, min: 1, max: 5 },
      review: { type: String },
      createdAt: { type: Date, default: Date.now },
    }],
    averageRating: { type: Number, default: 0 },
    totalSold: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ProductSchema.index({ name: 'text', description: 'text', tags: 'text' });

export const Product = mongoose.model<IProduct>('Product', ProductSchema);