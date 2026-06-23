import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

class CloudinaryService {
  async uploadBase64(base64: string, folder: string): Promise<string> {
    const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${base64}`, { folder, resource_type: 'image' });
    return result.secure_url;
  }

  async uploadFile(filePath: string, folder: string): Promise<string> {
    const result = await cloudinary.uploader.upload(filePath, { folder });
    return result.secure_url;
  }

  async deleteFile(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}

export const cloudinaryService = new CloudinaryService();