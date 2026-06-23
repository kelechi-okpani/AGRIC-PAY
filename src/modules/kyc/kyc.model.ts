import mongoose, { Document, Schema } from 'mongoose';
import { KYCStatus } from '../../core/types/enums';

export interface IKYC extends Document {
  userId: mongoose.Types.ObjectId;
  bvn?: string;
  nin?: string;
  bvnVerified: boolean;
  ninVerified: boolean;
  faceMatchScore?: number;
  faceMatchPassed: boolean;
  documentType?: 'NIN_SLIP' | 'PASSPORT' | 'DRIVERS_LICENSE';
  documentUrl?: string;
  selfieUrl?: string;
  status: KYCStatus;
  rejectionReason?: string;
  resubmissionNote?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const KYCSchema = new Schema<IKYC>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    bvn: { type: String, select: false },
    nin: { type: String, select: false },
    bvnVerified: { type: Boolean, default: false },
    ninVerified: { type: Boolean, default: false },
    faceMatchScore: { type: Number },
    faceMatchPassed: { type: Boolean, default: false },
    documentType: { type: String, enum: ['NIN_SLIP', 'PASSPORT', 'DRIVERS_LICENSE'] },
    documentUrl: { type: String },
    selfieUrl: { type: String },
    status: { type: String, enum: Object.values(KYCStatus), default: KYCStatus.PENDING },
    rejectionReason: { type: String },
    resubmissionNote: { type: String },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

export const KYC = mongoose.model<IKYC>('KYC', KYCSchema);