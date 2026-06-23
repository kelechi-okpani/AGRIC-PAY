import mongoose, { Document, Schema } from 'mongoose';
import { WalletType, TransactionType } from '../../core/types/enums';

export interface ITransaction {
  _id: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  description: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface IWallet extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: WalletType;
  balance: number;
  ledgerBalance: number;
  currency: string;
  isActive: boolean;
  isFrozen: boolean;
  frozenReason?: string;
  transactions: ITransaction[];
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    type: { type: String, enum: Object.values(TransactionType), required: true },
    amount: { type: Number, required: true, min: 0 },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reference: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

const WalletSchema = new Schema<IWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(WalletType), required: true },
    balance: { type: Number, default: 0, min: 0 },
    ledgerBalance: { type: Number, default: 0 },
    currency: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    isFrozen: { type: Boolean, default: false },
    frozenReason: { type: String },
    transactions: [TransactionSchema],
  },
  { timestamps: true }
);

WalletSchema.index({ userId: 1, type: 1 }, { unique: true });

export const Wallet = mongoose.model<IWallet>('Wallet', WalletSchema);