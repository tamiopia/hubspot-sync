import { redis } from '../config/redis';

// In-memory fallback map for environments without an active Redis instance
const inMemoryLocks = new Map<string, NodeJS.Timeout>();

/**
 * Acquires an idempotency lock with a configurable TTL (default 10 seconds).
 *
 * @param key Redis lock key, e.g. "lock:wix_to_hs:{id}" or "lock:hs_to_wix:{id}"
 * @param ttlSeconds Lock expiration time in seconds
 */
export const acquireLock = async (key: string, ttlSeconds: number = 10): Promise<void> => {
  try {
    if (redis.status === 'ready') {
      await redis.set(key, '1', 'EX', ttlSeconds);
      console.log(`🔒 [RedisLock] Acquired Redis lock for key: "${key}" (${ttlSeconds}s TTL)`);
      return;
    }
  } catch (err: any) {
    console.warn(`[RedisLock] Redis unavailable, using in-memory lock for "${key}":`, err.message);
  }

  // Fallback in-memory lock
  if (inMemoryLocks.has(key)) {
    clearTimeout(inMemoryLocks.get(key)!);
  }
  const timer = setTimeout(() => {
    inMemoryLocks.delete(key);
    console.log(`⏱️ [Lock] TTL expired and released for key: "${key}"`);
  }, ttlSeconds * 1000);

  inMemoryLocks.set(key, timer);
  console.log(`🔒 [Lock] Acquired in-memory lock for key: "${key}" (${ttlSeconds}s TTL)`);
};

/**
 * Checks whether an active lock exists in Redis to detect and prevent sync loop echoes.
 *
 * @param key Redis lock key
 * @returns boolean indicating if the lock key exists
 */
export const isLocked = async (key: string): Promise<boolean> => {
  try {
    if (redis.status === 'ready') {
      const exists = await redis.exists(key);
      const locked = exists === 1;
      console.log(`🔍 [RedisLock] Checked lock for "${key}": ${locked ? 'LOCKED (loop prevented)' : 'UNLOCKED'}`);
      return locked;
    }
  } catch (err: any) {
    console.warn(`[RedisLock] Redis unavailable, checking in-memory lock for "${key}":`, err.message);
  }

  // Fallback in-memory lock check
  const locked = inMemoryLocks.has(key);
  console.log(`🔍 [Lock] Checked lock for "${key}": ${locked ? 'LOCKED (loop prevented)' : 'UNLOCKED'}`);
  return locked;
};
