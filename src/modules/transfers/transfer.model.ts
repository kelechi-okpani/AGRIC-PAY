import mongoose, { Document, Schema } from 'mongoose';
import { TransferStatus } from '../../core/types/enums';

export interface ITransfer extends Document {
  _id: mongoose.Types.ObjectId;
  fromUserId: mongoose.Types.ObjectId;
  toUserId?: mongoose.Types.ObjectId;
  fromWalletType: string;
  amount: number;
  fee: number;
  currency: string;
  type: 'INTERNAL' | 'BANK' | 'CROSS_BORDER' | 'SCHEDULED' | 'RECURRING';
  status: TransferStatus;
  reference: string;
  gatewayReference?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  bankName?: string;
  narration?: string;
  scheduledAt?: Date;
  recurringInterval?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  recurringEndDate?: Date;
  retryCount: number;
  failureReason?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const TransferSchema = new Schema<ITransfer>(
  {
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    fromWalletType: { type: String, default: 'NGN' },
    amount: { type: Number, required: true, min: 1 },
    fee: { type: Number, default: 0 },
    currency: { type: String, default: 'NGN' },
    type: {
      type: String,
      enum: ['INTERNAL', 'BANK', 'CROSS_BORDER', 'SCHEDULED', 'RECURRING'],
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(TransferStatus),
      default: TransferStatus.PENDING,
    },
    reference: { type: String, required: true, unique: true, index: true },
    gatewayReference: { type: String },
    bankCode: { type: String },
    accountNumber: { type: String },
    accountName: { type: String },
    bankName: { type: String },
    narration: { type: String },
    scheduledAt: { type: Date },
    recurringInterval: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY'] },
    recurringEndDate: { type: Date },
    retryCount: { type: Number, default: 0 },
    failureReason: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Transfer = mongoose.model<ITransfer>('Transfer', TransferSchema);