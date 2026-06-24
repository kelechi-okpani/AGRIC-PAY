import mongoose, { Document, Schema } from 'mongoose';

export type DepositStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'ABANDONED';
export type DepositChannel = 'PAYSTACK' | 'FLUTTERWAVE' | 'BANK_TRANSFER' | 'USSD';

export interface IDeposit extends Document {
    _id: mongoose.Types.ObjectId;
  userId:    mongoose.Types.ObjectId;
  amount:    number;
  currency:  string;
  status:    DepositStatus;
  channel:   DepositChannel;
  reference: string;
  gatewayReference?: string;
  paymentUrl?: string;
  paidAt?:   Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const DepositSchema = new Schema<IDeposit>(
  {
    userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount:           { type: Number, required: true, min: 100 },
    currency:         { type: String, default: 'NGN' },
    status:           { type: String, enum: ['PENDING','SUCCESS','FAILED','ABANDONED'], default: 'PENDING' },
    channel:          { type: String, enum: ['PAYSTACK','FLUTTERWAVE','BANK_TRANSFER','USSD'], default: 'PAYSTACK' },
    reference:        { type: String, required: true, unique: true, index: true },
    gatewayReference: { type: String },
    paymentUrl:       { type: String },
    paidAt:           { type: Date },
    metadata:         { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Deposit = mongoose.model<IDeposit>('Deposit', DepositSchema);