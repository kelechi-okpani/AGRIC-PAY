import { KYC, IKYC } from './kyc.model';
import { User } from '../auth/auth.model';
import { KYCStatus, KYCLevel } from '../../core/types/enums';
import { dojahService } from '../../infrastructure/dojah';
import { cloudinaryService } from '../../infrastructure/cloudinary';
import { notificationQueue } from '../../queues';
import { eventBus, Events } from '../../events/EventBus';
import { AppError, NotFoundError, ValidationError } from '../../core/errors/AppError';
import { logger } from '../../shared/utils/logger';

export class KYCService {

  async submitBVN(userId: string, bvn: string): Promise<{ message: string }> {
    if (!/^\d{11}$/.test(bvn)) throw new ValidationError('BVN must be 11 digits');

    let kyc = await KYC.findOne({ userId });
    if (!kyc) kyc = await KYC.create({ userId });

    const result = await dojahService.verifyBVN(bvn);
    if (!result.valid) throw new AppError('BVN verification failed. Check your BVN and try again.', 400);

    kyc.bvn = bvn;
    kyc.bvnVerified = true;
    await kyc.save();

    await User.findByIdAndUpdate(userId, { kycLevel: KYCLevel.LEVEL_1 });

    return { message: 'BVN verified successfully. Proceed to NIN verification.' };
  }

  async submitNIN(userId: string, nin: string): Promise<{ message: string }> {
    if (!/^\d{11}$/.test(nin)) throw new ValidationError('NIN must be 11 digits');

    const kyc = await KYC.findOne({ userId });
    if (!kyc?.bvnVerified) throw new AppError('Please complete BVN verification first', 400);

    const result = await dojahService.verifyNIN(nin);
    if (!result.valid) throw new AppError('NIN verification failed. Check your NIN and try again.', 400);

    kyc.nin = nin;
    kyc.ninVerified = true;
    await kyc.save();

    return { message: 'NIN verified successfully. Proceed to face match.' };
  }

  async submitFaceMatch(userId: string, selfieBase64: string): Promise<{ message: string; score: number }> {
    const kyc = await KYC.findOne({ userId });
    if (!kyc?.ninVerified) throw new AppError('Please complete NIN verification first', 400);

    const selfieUrl = await cloudinaryService.uploadBase64(selfieBase64, `kyc/${userId}/selfie`);
    const result = await dojahService.faceMatch({ bvn: kyc.bvn!, selfieUrl });

    kyc.selfieUrl = selfieUrl;
    kyc.faceMatchScore = result.score;
    kyc.faceMatchPassed = result.score >= 0.8;

    if (kyc.faceMatchPassed) {
      kyc.status = KYCStatus.PENDING;
      await User.findByIdAndUpdate(userId, { kycLevel: KYCLevel.LEVEL_2 });
    }

    await kyc.save();
    eventBus.emit(Events.KYC_SUBMITTED, { userId, kycId: kyc._id });

    return {
      message: kyc.faceMatchPassed
        ? 'Face match successful. Your KYC is under review.'
        : 'Face match score too low. Please retake your selfie.',
      score: result.score,
    };
  }

  async uploadDocument(userId: string, data: {
    documentType: 'NIN_SLIP' | 'PASSPORT' | 'DRIVERS_LICENSE';
    documentBase64: string;
  }): Promise<{ message: string }> {
    const kyc = await KYC.findOne({ userId });
    if (!kyc) throw new NotFoundError('KYC record');

    const documentUrl = await cloudinaryService.uploadBase64(data.documentBase64, `kyc/${userId}/document`);
    kyc.documentType = data.documentType;
    kyc.documentUrl = documentUrl;
    kyc.status = KYCStatus.PENDING;
    await kyc.save();

    return { message: 'Document uploaded. Your KYC is under review.' };
  }

  async getKYCStatus(userId: string) {
    const kyc = await KYC.findOne({ userId });
    const user = await User.findById(userId);
    return { kyc, kycLevel: user?.kycLevel || 0 };
  }

  // ── ADMIN ACTIONS ─────────────────────────────────────────

  // ── ADMIN ACTIONS ─────────────────────────────────────────
async approveKYC(kycId: string, adminId: string): Promise<void> {
  const kyc = await KYC.findById(kycId);
  if (!kyc) throw new NotFoundError('KYC');

  kyc.status     = KYCStatus.APPROVED;
  kyc.reviewedBy = adminId as any;
  kyc.reviewedAt = new Date();
  await kyc.save();

  await User.findByIdAndUpdate(kyc.userId, { kycLevel: KYCLevel.LEVEL_2 });
  eventBus.emit(Events.KYC_APPROVED, { userId: kyc.userId });

  // Notification sent via event handler → notification queue → WhatsApp Cloud API
  await notificationQueue.add('kyc-approved', {
    userId:  kyc.userId.toString(),
    channel: 'WHATSAPP',
    message:
      `🎉 *KYC Approved!*\n\n` +
      `Your identity has been verified. You now have full access to AgroFinPay!\n` +
      `✅ ₦2,000,000 daily transfer limit\n` +
      `✅ Virtual dollar card\n` +
      `✅ Crypto trading\n\n` +
      `Reply *MENU* to get started.`,
  });
}

async rejectKYC(kycId: string, adminId: string, reason: string): Promise<void> {
  const kyc = await KYC.findById(kycId);
  if (!kyc) throw new NotFoundError('KYC');

  kyc.status          = KYCStatus.REJECTED;
  kyc.rejectionReason = reason;
  kyc.reviewedBy      = adminId as any;
  kyc.reviewedAt      = new Date();
  await kyc.save();

  eventBus.emit(Events.KYC_REJECTED, { userId: kyc.userId, reason });

  await notificationQueue.add('kyc-rejected', {
    userId:  kyc.userId.toString(),
    channel: 'WHATSAPP',
    message:
      `❌ *KYC Rejected*\n\n` +
      `Your KYC submission was rejected.\n` +
      `*Reason:* ${reason}\n\n` +
      `Reply *KYC* to resubmit your documents.`,
  });
}

async requestResubmission(kycId: string, adminId: string, note: string): Promise<void> {
  const kyc = await KYC.findById(kycId);
  if (!kyc) throw new NotFoundError('KYC');

  kyc.status            = KYCStatus.RESUBMISSION_REQUIRED;
  kyc.resubmissionNote  = note;
  kyc.reviewedBy        = adminId as any;
  await kyc.save();

  await notificationQueue.add('kyc-resubmit', {
    userId:  kyc.userId.toString(),
    channel: 'WHATSAPP',
    message:
      `⚠️ *Additional Info Required*\n\n` +
      `${note}\n\n` +
      `Reply *KYC* to resubmit your documents.`,
  });
}
   async getPendingKYCs(filters: { limit?: number; offset?: number }) {
    const [kycs, total] = await Promise.all([
      KYC.find({ status: KYCStatus.PENDING })
        .populate('userId', 'fullName phone email')
        .sort({ createdAt: 1 })
        .skip(filters.offset || 0)
        .limit(filters.limit || 20),
      KYC.countDocuments({ status: KYCStatus.PENDING }),
    ]);
    return { kycs, total };
  }


  // async approveKYC(kycId: string, adminId: string): Promise<void> {
  //   const kyc = await KYC.findById(kycId);
  //   if (!kyc) throw new NotFoundError('KYC');

  //   kyc.status = KYCStatus.APPROVED;
  //   kyc.reviewedBy = adminId as any;
  //   kyc.reviewedAt = new Date();
  //   await kyc.save();

  //   await User.findByIdAndUpdate(kyc.userId, { kycLevel: KYCLevel.LEVEL_2 });
  //   eventBus.emit(Events.KYC_APPROVED, { userId: kyc.userId });

  //   await notificationQueue.add('kyc-approved', {
  //     userId: kyc.userId.toString(),
  //     channel: 'WHATSAPP',
  //     message: `🎉 Your KYC has been approved! You now have full access to AgroFinPay. Your daily transfer limit is ₦2,000,000.`,
  //   });
  // }

  // async rejectKYC(kycId: string, adminId: string, reason: string): Promise<void> {
  //   const kyc = await KYC.findById(kycId);
  //   if (!kyc) throw new NotFoundError('KYC');

  //   kyc.status = KYCStatus.REJECTED;
  //   kyc.rejectionReason = reason;
  //   kyc.reviewedBy = adminId as any;
  //   kyc.reviewedAt = new Date();
  //   await kyc.save();

  //   eventBus.emit(Events.KYC_REJECTED, { userId: kyc.userId, reason });

  //   await notificationQueue.add('kyc-rejected', {
  //     userId: kyc.userId.toString(),
  //     channel: 'WHATSAPP',
  //     message: `❌ Your KYC was rejected.\nReason: ${reason}\n\nReply *KYC* to resubmit.`,
  //   });
  // }

  // async requestResubmission(kycId: string, adminId: string, note: string): Promise<void> {
  //   const kyc = await KYC.findById(kycId);
  //   if (!kyc) throw new NotFoundError('KYC');

  //   kyc.status = KYCStatus.RESUBMISSION_REQUIRED;
  //   kyc.resubmissionNote = note;
  //   kyc.reviewedBy = adminId as any;
  //   await kyc.save();

  //   await notificationQueue.add('kyc-resubmit', {
  //     userId: kyc.userId.toString(),
  //     channel: 'WHATSAPP',
  //     message: `⚠️ Additional information required for your KYC:\n${note}\n\nReply *KYC* to resubmit.`,
  //   });
  // }

 
}

export const kycService = new KYCService();