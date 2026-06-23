import mongoose, { Document, Schema } from 'mongoose';

export interface ICrypto extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'BUY' | 'SELL' | 'SWAP';
  asset: string;
  fromAsset?: string;
  toAsset?: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  reference: string;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CryptoSchema = new Schema<ICrypto>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['BUY', 'SELL', 'SWAP'], required: true },
    asset: { type: String, required: true },
    fromAsset: { type: String },
    toAsset: { type: String },
    fromAmount: { type: Number, required: true },
    toAmount: { type: Number, required: true },
    rate: { type: Number, required: true },
    status: { type: String, enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'], default: 'PENDING' },
    reference: { type: String, required: true, unique: true },
    failureReason: { type: String },
  },
  { timestamps: true }
);

export const Crypto = mongoose.model<ICrypto>('Crypto', CryptoSchema);