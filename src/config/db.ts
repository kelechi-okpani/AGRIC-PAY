import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../shared/utils/logger';

export const connectDB = async (): Promise<void> => {
  try {
    mongoose.set('strictQuery', true);

    mongoose.connection.on('connected', () => logger.info('✅ MongoDB connected'));
    mongoose.connection.on('error', (err) => logger.error('❌ MongoDB error:', err));
    mongoose.connection.on('disconnected', () => logger.warn('⚠️  MongoDB disconnected'));

    await mongoose.connect(env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};