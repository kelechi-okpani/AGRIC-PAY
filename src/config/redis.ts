import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../shared/utils/logger';

// export const redis = new Redis({
//   host: env.REDIS_HOST,
//   port: env.REDIS_PORT,
//   password: env.REDIS_PASSWORD || undefined,
//   retryStrategy: (times) => Math.min(times * 50, 2000),
//   maxRetriesPerRequest: null,
// });


export const redis = new Redis({
  host: env.REDIS_HOST,
  port: Number(env.REDIS_PORT),
  password: env.REDIS_PASSWORD || undefined,

  connectTimeout: 10000,
  maxRetriesPerRequest: null,

  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  },
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('ready', () => {
  console.log('✅ Redis ready');
});

redis.on('error', (err) => {
  console.error('❌ Redis error', err);
});

redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', (err) => logger.error('❌ Redis error:', err));

export default redis;