import mongoose, { Document, Schema } from 'mongoose';
import { AdminRole } from '../../core/types/enums';

export interface IAdmin extends Document {
  fullName: string;
  email: string;
  password: string;
  role: AdminRole;
  isActive: boolean;
  lastLogin?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSchema = new Schema<IAdmin>(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(AdminRole), required: true },
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

export const Admin = mongoose.model<IAdmin>('Admin', AdminSchema);