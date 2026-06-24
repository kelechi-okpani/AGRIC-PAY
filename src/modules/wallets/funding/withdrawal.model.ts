import mongoose, { Document, Schema } from 'mongoose';

export type WithdrawalStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REVERSED';

export interface IWithdrawal extends Document {
  _id: mongoose.Types.ObjectId;
  userId:         mongoose.Types.ObjectId;
  amount:         number;
  fee:            number;
  netAmount:      number;
  currency:       string;
  status:         WithdrawalStatus;
  reference:      string;
  gatewayReference?: string;
  bankCode:       string;
  bankName:       string;
  accountNumber:  string;
  accountName:    string;
  narration?:     string;
  failureReason?: string;
  processedAt?:   Date;
  metadata?:      Record<string, any>;
  createdAt:      Date;
  updatedAt:      Date;
}

const WithdrawalSchema = new Schema<IWithdrawal>(
  {
    userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount:           { type: Number, required: true, min: 100 },
    fee:              { type: Number, default: 0 },
    netAmount:        { type: Number, required: true },
    currency:         { type: String, default: 'NGN' },
    status:           { type: String, enum: ['PENDING','PROCESSING','SUCCESS','FAILED','REVERSED'], default: 'PENDING' },
    reference:        { type: String, required: true, unique: true, index: true },
    gatewayReference: { type: String },
    bankCode:         { type: String, required: true },
    bankName:         { type: String, required: true },
    accountNumber:    { type: String, required: true },
    accountName:      { type: String, required: true },
    narration:        { type: String },
    failureReason:    { type: String },
    processedAt:      { type: Date },
    metadata:         { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Withdrawal = mongoose.model<IWithdrawal>('Withdrawal', WithdrawalSchema);