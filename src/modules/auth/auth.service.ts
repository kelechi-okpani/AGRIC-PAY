import { User, IUser } from './auth.model';
import { hashPassword, comparePassword } from '../../shared/utils/hash';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/utils/jwt';
import { generateOTP, saveOTP, verifyOTP } from '../../shared/utils/otp';
import { AppError, ConflictError, UnauthorizedError, NotFoundError, ValidationError } from '../../core/errors/AppError';
import { eventBus, Events } from '../../events/EventBus';
import { UserRole } from '../../core/types/enums';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import redis from '../../config/redis';

export class AuthService {

  // ── REGISTER ──────────────────────────────────────────────
  async register(data: {
    phone: string;
    fullName: string;
    email?: string;
    role?: UserRole;
  }): Promise<{ message: string }> {
    const existing = await User.findOne({ phone: data.phone });
    if (existing) throw new ConflictError('Phone number already registered');

    const user = await User.create({
      phone: data.phone,
      fullName: data.fullName,
      email: data.email,
      role: data.role || UserRole.CONSUMER,
    });

    const otp = generateOTP();
    await saveOTP(data.phone, otp);

    eventBus.emit(Events.OTP_REQUESTED, { phone: data.phone, otp, userId: user._id });
    eventBus.emit(Events.USER_REGISTERED, { userId: user._id, phone: data.phone });

    return { message: 'Registration successful. OTP sent to your phone.' };
  }

  // ── VERIFY OTP ────────────────────────────────────────────
  async verifyOtp(data: {
    phone: string;
    otp: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
  }): Promise<{ accessToken: string; refreshToken: string; user: Partial<IUser> }> {
    const isValid = await verifyOTP(data.phone, data.otp);
    if (!isValid) throw new ValidationError('Invalid or expired OTP');

    const user = await User.findOne({ phone: data.phone });
    if (!user) throw new NotFoundError('User');

    user.isVerified = true;

    if (data.deviceId) {
      const existingDevice = user.devices.find((d) => d.deviceId === data.deviceId);
      if (!existingDevice) {
        user.devices.push({
          deviceId: data.deviceId,
          deviceName: data.deviceName || 'Unknown',
          lastLogin: new Date(),
          ip: data.ip || '',
        });
      } else {
        existingDevice.lastLogin = new Date();
        existingDevice.ip = data.ip || '';
      }
    }

    const accessToken = signAccessToken({
      id: user._id.toString(),
      phone: user.phone,
      role: user.role,
      kycLevel: user.kycLevel,
    });
    const refreshToken = signRefreshToken({ id: user._id.toString() });
    user.refreshToken = refreshToken;
    await user.save();

    return {
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        phone: user.phone,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        kycLevel: user.kycLevel,
        isVerified: user.isVerified,
      },
    };
  }

  // ── LOGIN ─────────────────────────────────────────────────
  async login(data: {
    phone: string;
    password?: string;
    deviceId?: string;
    deviceName?: string;
    ip?: string;
  }): Promise<{ message: string } | { accessToken: string; refreshToken: string; user: Partial<IUser> }> {
    const user = await User.findOne({ phone: data.phone }).select('+password +twoFactorSecret');
    if (!user) throw new UnauthorizedError('Invalid credentials');
    if (!user.isVerified) throw new UnauthorizedError('Account not verified. Please verify your OTP.');
    if (user.isSuspended) throw new UnauthorizedError('Account suspended. Contact support.');

    if (user.password && data.password) {
      const valid = await comparePassword(data.password, user.password);
      if (!valid) throw new UnauthorizedError('Invalid credentials');
    } else {
      // OTP-based login
      const otp = generateOTP();
      await saveOTP(data.phone, otp);
      eventBus.emit(Events.OTP_REQUESTED, { phone: data.phone, otp, userId: user._id });
      return { message: 'OTP sent to your phone. Verify to complete login.' };
    }

    if (user.twoFactorEnabled) {
      const tempToken = signAccessToken({ id: user._id.toString(), phone: user.phone, role: user.role, kycLevel: user.kycLevel });
      await redis.set(`2fa:pending:${user._id}`, tempToken, 'EX', 300);
      return { message: '2FA required. Please provide your authenticator code.' };
    }

    return this._issueTokens(user, data);
  }

  // ── VERIFY 2FA ────────────────────────────────────────────
  async verify2FA(userId: string, token: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await User.findById(userId).select('+twoFactorSecret');
    if (!user || !user.twoFactorSecret) throw new UnauthorizedError('2FA not set up');

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) throw new UnauthorizedError('Invalid 2FA code');

    return this._issueTokens(user, {});
  }

  // ── SETUP 2FA ─────────────────────────────────────────────
  async setup2FA(userId: string): Promise<{ qrCode: string; secret: string }> {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    const secret = speakeasy.generateSecret({ name: `AgroFinPay (${user.phone})` });
    user.twoFactorSecret = secret.base32;
    await user.save();

    const qrCode = await qrcode.toDataURL(secret.otpauth_url!);
    return { qrCode, secret: secret.base32 };
  }

  // ── ENABLE 2FA ────────────────────────────────────────────
  async enable2FA(userId: string, token: string): Promise<void> {
    const user = await User.findById(userId).select('+twoFactorSecret');
    if (!user || !user.twoFactorSecret) throw new AppError('Setup 2FA first', 400);

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 1,
    });

    if (!verified) throw new ValidationError('Invalid 2FA code');
    user.twoFactorEnabled = true;
    await user.save();
  }

  // ── REFRESH TOKEN ─────────────────────────────────────────
  async refreshToken(token: string): Promise<{ accessToken: string }> {
    const decoded = verifyRefreshToken(token);
    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== token) throw new UnauthorizedError('Invalid refresh token');

    const accessToken = signAccessToken({
      id: user._id.toString(),
      phone: user.phone,
      role: user.role,
      kycLevel: user.kycLevel,
    });

    return { accessToken };
  }

  // ── FORGOT PASSWORD ───────────────────────────────────────
  async forgotPassword(phone: string): Promise<{ message: string }> {
    const user = await User.findOne({ phone });
    if (!user) throw new NotFoundError('User');

    const otp = generateOTP();
    await saveOTP(`reset:${phone}`, otp);
    eventBus.emit(Events.OTP_REQUESTED, { phone, otp, type: 'PASSWORD_RESET' });

    return { message: 'Password reset OTP sent to your phone.' };
  }

  // ── RESET PASSWORD ────────────────────────────────────────
  async resetPassword(data: { phone: string; otp: string; newPassword: string }): Promise<void> {
    const isValid = await verifyOTP(`reset:${data.phone}`, data.otp);
    if (!isValid) throw new ValidationError('Invalid or expired OTP');

    const user = await User.findOne({ phone: data.phone });
    if (!user) throw new NotFoundError('User');

    user.password = await hashPassword(data.newPassword);
    await user.save();
  }

  // ── LOGOUT ────────────────────────────────────────────────
  async logout(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
  }

  // ── RESEND OTP ────────────────────────────────────────────
  async resendOTP(phone: string): Promise<{ message: string }> {
    const user = await User.findOne({ phone });
    if (!user) throw new NotFoundError('User');

    const otp = generateOTP();
    await saveOTP(phone, otp);
    eventBus.emit(Events.OTP_REQUESTED, { phone, otp, userId: user._id });

    return { message: 'OTP resent successfully.' };
  }

  // ── GET SESSIONS ──────────────────────────────────────────
  async getSessions(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');
    return user.devices;
  }

  // ── REVOKE SESSION ────────────────────────────────────────
  async revokeSession(userId: string, deviceId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      $pull: { devices: { deviceId } },
    });
  }

  // ── PRIVATE: ISSUE TOKENS ─────────────────────────────────
  private async _issueTokens(user: IUser, data: { deviceId?: string; deviceName?: string; ip?: string }) {
    const accessToken = signAccessToken({
      id: user._id.toString(),
      phone: user.phone,
      role: user.role,
      kycLevel: user.kycLevel,
    });
    const refreshToken = signRefreshToken({ id: user._id.toString() });

    user.refreshToken = refreshToken;
    if (data.deviceId) {
      const existingDevice = user.devices.find((d) => d.deviceId === data.deviceId);
      if (!existingDevice) {
        user.devices.push({ deviceId: data.deviceId!, deviceName: data.deviceName || 'Unknown', lastLogin: new Date(), ip: data.ip || '' });
      } else {
        existingDevice.lastLogin = new Date();
      }
    }
    await user.save();

    return {
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        phone: user.phone,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        kycLevel: user.kycLevel,
        isVerified: user.isVerified,
      },
    };
  }
}

export const authService = new AuthService();