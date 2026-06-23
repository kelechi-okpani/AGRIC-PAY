import mongoose, { Document, Schema } from 'mongoose';

export interface IBeneficiary {
  name: string;
  phone?: string;
  bankCode?: string;
  accountNumber?: string;
  accountName?: string;
  type: 'INTERNAL' | 'BANK';
}

export interface IUserProfile extends Document {
  userId: mongoose.Types.ObjectId;
  avatar?: string;
  dateOfBirth?: Date;
  address?: string;
  state?: string;
  country: string;
  preferredLanguage: string;
  pushNotifications: boolean;
  whatsappNotifications: boolean;
  smsNotifications: boolean;
  emailNotifications: boolean;
  beneficiaries: IBeneficiary[];
  linkedBankAccounts: {
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    monoAccountId?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const UserProfileSchema = new Schema<IUserProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    avatar: { type: String },
    dateOfBirth: { type: Date },
    address: { type: String },
    state: { type: String },
    country: { type: String, default: 'Nigeria' },
    preferredLanguage: { type: String, default: 'en' },
    pushNotifications: { type: Boolean, default: true },
    whatsappNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: false },
    beneficiaries: [{
      name: String,
      phone: String,
      bankCode: String,
      accountNumber: String,
      accountName: String,
      type: { type: String, enum: ['INTERNAL', 'BANK'] },
    }],
    linkedBankAccounts: [{
      bankCode: String,
      bankName: String,
      accountNumber: String,
      accountName: String,
      monoAccountId: String,
    }],
  },
  { timestamps: true }
);

export const UserProfile = mongoose.model<IUserProfile>('UserProfile', UserProfileSchema);