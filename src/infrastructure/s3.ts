import AWS from 'aws-sdk';
import { env } from '../config/env';
import { AppError } from '../core/errors/AppError';
import { logger } from '../shared/utils/logger';
import { v4 as uuidv4 } from 'uuid';

AWS.config.update({
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  region: env.AWS_REGION,
});

const s3 = new AWS.S3();

class S3Service {

  async uploadBuffer(buffer: Buffer, folder: string, mimetype: string): Promise<string> {
    const key = `${folder}/${uuidv4()}`;
    const ext = mimetype.split('/')[1];
    const fullKey = `${key}.${ext}`;

    try {
      const result = await s3.upload({
        Bucket: env.AWS_S3_BUCKET,
        Key: fullKey,
        Body: buffer,
        ContentType: mimetype,
        ACL: 'public-read',
      }).promise();

      logger.info(`[S3] Uploaded: ${fullKey}`);
      return result.Location;
    } catch (err) {
      logger.error('[S3] Upload failed:', err);
      throw new AppError('File upload failed', 500);
    }
  }

  async uploadBase64(base64: string, folder: string, mimetype: string = 'image/jpeg'): Promise<string> {
    const buffer = Buffer.from(base64, 'base64');
    return this.uploadBuffer(buffer, folder, mimetype);
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await s3.deleteObject({ Bucket: env.AWS_S3_BUCKET, Key: key }).promise();
      logger.info(`[S3] Deleted: ${key}`);
    } catch (err) {
      logger.error('[S3] Delete failed:', err);
      throw new AppError('File deletion failed', 500);
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    return s3.getSignedUrlPromise('getObject', {
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      Expires: expiresIn,
    });
  }

  async listFiles(prefix: string): Promise<AWS.S3.ObjectList> {
    try {
      const result = await s3.listObjectsV2({ Bucket: env.AWS_S3_BUCKET, Prefix: prefix }).promise();
      return result.Contents || [];
    } catch (err) {
      throw new AppError('Failed to list files', 500);
    }
  }
}

export const s3Service = new S3Service();