import { UserProfile, IUserProfile, IBeneficiary } from './user.model';
import { User } from '../auth/auth.model';
import { cloudinaryService } from '../../infrastructure/cloudinary';
import { NotFoundError, ConflictError } from '../../core/errors/AppError';

export class UserService {

  async getOrCreateProfile(userId: string): Promise<IUserProfile> {
    let profile = await UserProfile.findOne({ userId });
    if (!profile) {
      profile = await UserProfile.create({ userId });
    }
    return profile;
  }

  async updateProfile(userId: string, data: Partial<IUserProfile>): Promise<IUserProfile> {
    const profile = await UserProfile.findOneAndUpdate({ userId }, data, { new: true, upsert: true });
    return profile!;
  }

  async uploadAvatar(userId: string, base64Image: string): Promise<string> {
    const avatarUrl = await cloudinaryService.uploadBase64(base64Image, `avatars/${userId}`);
    await UserProfile.findOneAndUpdate({ userId }, { avatar: avatarUrl }, { upsert: true });
    return avatarUrl;
  }

  async addBeneficiary(userId: string, beneficiary: IBeneficiary): Promise<IUserProfile> {
    const profile = await this.getOrCreateProfile(userId);
    const exists = profile.beneficiaries.find(
      (b) => b.phone === beneficiary.phone || b.accountNumber === beneficiary.accountNumber
    );
    if (exists) throw new ConflictError('Beneficiary already exists');
    profile.beneficiaries.push(beneficiary);
    return profile.save();
  }

  async removeBeneficiary(userId: string, accountNumber: string): Promise<IUserProfile> {
    const profile = await UserProfile.findOneAndUpdate(
      { userId },
      { $pull: { beneficiaries: { accountNumber } } },
      { new: true }
    );
    if (!profile) throw new NotFoundError('Profile');
    return profile;
  }

  async updateNotificationPreferences(userId: string, prefs: {
    pushNotifications?: boolean;
    whatsappNotifications?: boolean;
    smsNotifications?: boolean;
    emailNotifications?: boolean;
  }): Promise<IUserProfile> {
    return this.updateProfile(userId, prefs);
  }

  async getUserWithProfile(userId: string) {
    const [user, profile] = await Promise.all([
      User.findById(userId),
      UserProfile.findOne({ userId }),
    ]);
    if (!user) throw new NotFoundError('User');
    return { ...user.toObject(), profile };
  }

  async linkBankAccount(userId: string, data: {
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    monoAccountId?: string;
  }): Promise<IUserProfile> {
    const profile = await this.getOrCreateProfile(userId);
    const exists = profile.linkedBankAccounts.find((a) => a.accountNumber === data.accountNumber);
    if (exists) throw new ConflictError('Bank account already linked');
    profile.linkedBankAccounts.push(data);
    return profile.save();
  }
}

export const userService = new UserService();