import Redis from "ioredis";
import { env } from "./env";
import { logger } from "@shared/utils/logger";



export const redis = new Redis({
  host: env.REDIS_HOST,
  port: Number(env.REDIS_PORT || env.REDIS_URL),
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



// export const redis = env.REDIS_URL
//   ? new Redis(env.REDIS_URL, {
//       connectTimeout: 10000,
//       maxRetriesPerRequest: null,

//       retryStrategy(times) {
//         return Math.min(times * 100, 3000);
//       },
//     })
//   : new Redis({
//       host: env.REDIS_HOST,
//       port: Number(env.REDIS_PORT),
//       password: env.REDIS_PASSWORD || undefined,

//       connectTimeout: 10000,
//       maxRetriesPerRequest: null,

//       retryStrategy(times) {
//         return Math.min(times * 100, 3000);
//       },
//     });

// redis.on("connect", () => {
//   console.log("✅ Redis connected");
//   logger.info("✅ Redis connected");
// });

// redis.on("ready", () => {
//   console.log("✅ Redis ready");
// });

// redis.on("error", (err) => {
//   console.error("❌ Redis error", err);
//   logger.error("❌ Redis error:", err);
// });

// export default redis;