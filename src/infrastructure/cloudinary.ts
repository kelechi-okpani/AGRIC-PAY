import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { env } from '../config/env';
import { AppError } from '../core/errors/AppError';
import { logger } from '../shared/utils/logger';
import { v4 as uuidv4 } from 'uuid';

cloudinary.config({
  cloud_name:  env.CLOUDINARY_CLOUD_NAME,
  api_key:     env.CLOUDINARY_API_KEY,
  api_secret:  env.CLOUDINARY_API_SECRET,
  secure:      true,
});

class CloudinaryService {

  // ── UPLOAD BASE64 IMAGE ───────────────────────────────────
  async uploadBase64(
    base64: string,
    folder: string,
    options?: { format?: string; transformation?: object[] }
  ): Promise<string> {
    try {
      const dataUri = base64.startsWith('data:')
        ? base64
        : `data:image/jpeg;base64,${base64}`;

      const result: UploadApiResponse = await cloudinary.uploader.upload(dataUri, {
        folder,
        public_id:      uuidv4(),
        resource_type:  'image',
        format:         options?.format || 'webp',
        transformation: options?.transformation || [{ quality: 'auto', fetch_format: 'auto' }],
        overwrite:      false,
      });

      logger.info(`[Cloudinary] Uploaded: ${result.public_id}`);
      return result.secure_url;
    } catch (err: any) {
      logger.error('[Cloudinary] Upload base64 failed:', err.message);
      throw new AppError('File upload failed', 500);
    }
  }

  // ── UPLOAD FROM LOCAL FILE PATH ───────────────────────────
  async uploadFile(
    filePath: string,
    folder: string,
    options?: { resourceType?: 'image' | 'video' | 'raw' | 'auto'; format?: string }
  ): Promise<string> {
    try {
      const result: UploadApiResponse = await cloudinary.uploader.upload(filePath, {
        folder,
        public_id:     uuidv4(),
        resource_type: options?.resourceType || 'auto',
        format:        options?.format,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      });

      logger.info(`[Cloudinary] File uploaded: ${result.public_id}`);
      return result.secure_url;
    } catch (err: any) {
      logger.error('[Cloudinary] Upload file failed:', err.message);
      throw new AppError('File upload failed', 500);
    }
  }

  // ── UPLOAD BUFFER ─────────────────────────────────────────
  async uploadBuffer(
    buffer: Buffer,
    folder: string,
    mimetype: string = 'image/jpeg'
  ): Promise<string> {
    try {
      const base64 = `data:${mimetype};base64,${buffer.toString('base64')}`;
      return this.uploadBase64(base64, folder);
    } catch (err: any) {
      logger.error('[Cloudinary] Upload buffer failed:', err.message);
      throw new AppError('File upload failed', 500);
    }
  }

  // ── UPLOAD KYC DOCUMENT ───────────────────────────────────
  async uploadKYCDocument(
    base64: string,
    userId: string,
    docType: 'selfie' | 'nin_slip' | 'passport' | 'drivers_license'
  ): Promise<string> {
    return this.uploadBase64(base64, `agrofinpay/kyc/${userId}/${docType}`, {
      format: 'jpg',
      transformation: [
        { quality: 85 },
        { width: 1200, height: 1200, crop: 'limit' },
      ],
    });
  }

  // ── UPLOAD PRODUCT IMAGE ──────────────────────────────────
  async uploadProductImage(base64: string, productId: string): Promise<string> {
    return this.uploadBase64(base64, `agrofinpay/products/${productId}`, {
      format: 'webp',
      transformation: [
        { width: 800, height: 800, crop: 'fill', gravity: 'auto' },
        { quality: 'auto' },
      ],
    });
  }

  // ── UPLOAD AVATAR ─────────────────────────────────────────
  async uploadAvatar(base64: string, userId: string): Promise<string> {
    return this.uploadBase64(base64, `agrofinpay/avatars`, {
      format: 'webp',
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto' },
      ],
    });
  }

  // ── UPLOAD BUSINESS LOGO ──────────────────────────────────
  async uploadBusinessLogo(base64: string, businessId: string): Promise<string> {
    return this.uploadBase64(base64, `agrofinpay/business/${businessId}`, {
      format: 'webp',
      transformation: [
        { width: 400, height: 400, crop: 'pad', background: 'white' },
        { quality: 'auto' },
      ],
    });
  }

  // ── UPLOAD PROOF OF DELIVERY ──────────────────────────────
  async uploadProofOfDelivery(base64: string, orderId: string): Promise<string> {
    return this.uploadBase64(base64, `agrofinpay/deliveries/${orderId}`, {
      format: 'jpg',
      transformation: [
        { width: 1200, crop: 'limit' },
        { quality: 80 },
      ],
    });
  }

  // ── UPLOAD WHATSAPP MEDIA ─────────────────────────────────
  async uploadWhatsAppMedia(
    mediaUrl: string,
    folder: string
  ): Promise<string> {
    try {
      const result: UploadApiResponse = await cloudinary.uploader.upload(mediaUrl, {
        folder: `agrofinpay/whatsapp/${folder}`,
        public_id:     uuidv4(),
        resource_type: 'auto',
      });
      logger.info(`[Cloudinary] WhatsApp media uploaded: ${result.public_id}`);
      return result.secure_url;
    } catch (err: any) {
      logger.error('[Cloudinary] WhatsApp media upload failed:', err.message);
      throw new AppError('Media upload failed', 500);
    }
  }

  // ── DELETE FILE ───────────────────────────────────────────
  async deleteFile(publicIdOrUrl: string): Promise<void> {
    try {
      // Extract public_id from URL if full URL passed
      let publicId = publicIdOrUrl;
      if (publicIdOrUrl.includes('cloudinary.com')) {
        const parts = publicIdOrUrl.split('/');
        const uploadIndex = parts.indexOf('upload');
        if (uploadIndex !== -1) {
          publicId = parts
            .slice(uploadIndex + 2) // skip version segment
            .join('/')
            .replace(/\.[^/.]+$/, ''); // remove extension
        }
      }

      await cloudinary.uploader.destroy(publicId);
      logger.info(`[Cloudinary] Deleted: ${publicId}`);
    } catch (err: any) {
      logger.error('[Cloudinary] Delete failed:', err.message);
      throw new AppError('File deletion failed', 500);
    }
  }

  // ── GET SIGNED URL (time-limited private access) ──────────
  async getSignedUrl(publicId: string, expiresInSeconds: number = 3600): Promise<string> {
    try {
      const timestamp = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const signature = cloudinary.utils.api_sign_request(
        { public_id: publicId, timestamp },
        env.CLOUDINARY_API_SECRET
      );

      return cloudinary.url(publicId, {
        secure:    true,
        sign_url:  true,
        type:      'authenticated',
        expires_at: timestamp,
      });
    } catch (err: any) {
      logger.error('[Cloudinary] Signed URL failed:', err.message);
      throw new AppError('Could not generate signed URL', 500);
    }
  }

  // ── GENERATE OPTIMISED THUMBNAIL URL ─────────────────────
  getThumbnailUrl(
    originalUrl: string,
    width: number = 200,
    height: number = 200
  ): string {
    if (!originalUrl.includes('cloudinary.com')) return originalUrl;

    return originalUrl.replace(
      '/upload/',
      `/upload/w_${width},h_${height},c_fill,q_auto,f_auto/`
    );
  }

  // ── LIST FILES IN FOLDER ──────────────────────────────────
  async listFiles(folder: string): Promise<{ public_id: string; secure_url: string; created_at: string }[]> {
    try {
      const result = await cloudinary.api.resources({
        type:        'upload',
        prefix:      folder,
        max_results: 100,
      });
      return result.resources.map((r: any) => ({
        public_id:  r.public_id,
        secure_url: r.secure_url,
        created_at: r.created_at,
      }));
    } catch (err: any) {
      logger.error('[Cloudinary] List files failed:', err.message);
      throw new AppError('Failed to list files', 500);
    }
  }

  // ── BULK DELETE ───────────────────────────────────────────
  async bulkDelete(publicIds: string[]): Promise<void> {
    try {
      await cloudinary.api.delete_resources(publicIds);
      logger.info(`[Cloudinary] Bulk deleted ${publicIds.length} files`);
    } catch (err: any) {
      logger.error('[Cloudinary] Bulk delete failed:', err.message);
      throw new AppError('Bulk delete failed', 500);
    }
  }
}

export const cloudinaryService = new CloudinaryService();

// import { v2 as cloudinary } from 'cloudinary';
// import { env } from '../config/env';

// cloudinary.config({
//   cloud_name: env.CLOUDINARY_CLOUD_NAME,
//   api_key: env.CLOUDINARY_API_KEY,
//   api_secret: env.CLOUDINARY_API_SECRET,
// });

// class CloudinaryService {
//   async uploadBase64(base64: string, folder: string): Promise<string> {
//     const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${base64}`, { folder, resource_type: 'image' });
//     return result.secure_url;
//   }

//   async uploadFile(filePath: string, folder: string): Promise<string> {
//     const result = await cloudinary.uploader.upload(filePath, { folder });
//     return result.secure_url;
//   }

//   async deleteFile(publicId: string): Promise<void> {
//     await cloudinary.uploader.destroy(publicId);
//   }
// }

// export const cloudinaryService = new CloudinaryService();