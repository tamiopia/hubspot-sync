import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    if (times > 2) return null;
    return 1000;
  },
  lazyConnect: true,
  enableOfflineQueue: false,
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis successfully');
});

redis.on('error', (err) => {
  // Silent or single warning
});
