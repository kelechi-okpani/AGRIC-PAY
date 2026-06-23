import mongoose, { Document, Schema } from 'mongoose';

export interface ICardTransaction {
  amount: number;
  currency: string;
  type: 'DEBIT' | 'CREDIT';
  description: string;
  reference: string;
  createdAt: Date;
}

export interface ICard extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  gatewayCardId: string;
  cardNumber: string;
  maskedNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  currency: string;
  balance: number;
  isActive: boolean;
  isFrozen: boolean;
  isTerminated: boolean;
  transactions: ICardTransaction[];
  spendLimit?: number;
  createdAt: Date;
  updatedAt: Date;
}

const CardSchema = new Schema<ICard>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    gatewayCardId: { type: String, default: '' },
    cardNumber: { type: String, select: false },
    maskedNumber: { type: String },
    expiryMonth: { type: String },
    expiryYear: { type: String },
    cvv: { type: String, select: false },
    currency: { type: String, default: 'USD' },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: false },
    isFrozen: { type: Boolean, default: false },
    isTerminated: { type: Boolean, default: false },
    transactions: [{
      amount: Number,
      currency: String,
      type: { type: String, enum: ['DEBIT', 'CREDIT'] },
      description: String,
      reference: String,
      createdAt: { type: Date, default: Date.now },
    }],
    spendLimit: { type: Number },
  },
  { timestamps: true }
);

export const Card = mongoose.model<ICard>('Card', CardSchema);