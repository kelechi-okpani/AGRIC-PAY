import mongoose, { Document, Schema } from 'mongoose';

export interface IEmployee {
  name: string;
  role: string;
  salary: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

export interface IBusiness extends Document {
  userId: mongoose.Types.ObjectId;
  businessName: string;
  cacNumber?: string;
  businessType: 'SOLE_PROPRIETORSHIP' | 'PARTNERSHIP' | 'LIMITED_LIABILITY';
  industry: string;
  address: string;
  email: string;
  phone: string;
  logoUrl?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  employees: IEmployee[];
  walletBalance: number;
  rejectionReason?: string;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BusinessSchema = new Schema<IBusiness>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    businessName: { type: String, required: true },
    cacNumber: { type: String },
    businessType: { type: String, enum: ['SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'LIMITED_LIABILITY'], required: true },
    industry: { type: String, required: true },
    address: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    logoUrl: { type: String },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'], default: 'PENDING' },
    employees: [{
      name: String,
      role: String,
      salary: Number,
      bankCode: String,
      accountNumber: String,
      accountName: String,
    }],
    walletBalance: { type: Number, default: 0 },
    rejectionReason: { type: String },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

export const Business = mongoose.model<IBusiness>('Business', BusinessSchema);