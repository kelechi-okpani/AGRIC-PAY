import mongoose, { Document, Schema } from 'mongoose';
import { UserRole, KYCLevel } from '../../core/types/enums';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  phone: string;
  email?: string;
  fullName: string;
  password?: string;
  role: UserRole;
  kycLevel: KYCLevel;
  isVerified: boolean;
  isActive: boolean;
  isSuspended: boolean;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  devices: {
    deviceId: string;
    deviceName: string;
    lastLogin: Date;
    ip: string;
  }[];
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    phone: { type: String, required: true, unique: true, index: true },
    email: { type: String, unique: true, sparse: true, lowercase: true },
    fullName: { type: String, required: true, trim: true },
    password: { type: String, select: false },
    role: { type: String, enum: Object.values(UserRole), default: UserRole.CONSUMER },
    kycLevel: { type: Number, enum: [0, 1, 2, 3], default: 0 },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isSuspended: { type: Boolean, default: false },
    twoFactorSecret: { type: String, select: false },
    twoFactorEnabled: { type: Boolean, default: false },
    devices: [
      {
        deviceId: String,
        deviceName: String,
        lastLogin: Date,
        ip: String,
      },
    ],
    refreshToken: { type: String, select: false },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);