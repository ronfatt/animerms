import IORedis from 'ioredis';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required');
}

export const redisConnection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
  enableOfflineQueue: false,
  connectTimeout: 5000
});
