import { getRedisClient } from '../queue/redisClient.ts';
import { dbService } from './dbService.ts';

export interface IdempotencyResult {
  isDuplicate: boolean;
  existingNotification?: any;
}

// In-memory LRU-style idempotency cache for sub-millisecond lookup when Redis is absent
const memoryIdempotencyCache = new Map<string, { notificationId: string; expiresAt: number }>();

export const idempotencyService = {
  /**
   * Checks if an idempotency key has already been processed for this application.
   * Leverages high-speed Redis or memory key lookups backed by database uniqueness constraints.
   */
  async checkIdempotency(
    applicationId: string,
    idempotencyKey: string
  ): Promise<IdempotencyResult> {
    const cacheKey = `nx:idemp:${applicationId}:${idempotencyKey}`;

    // 1. Check in-memory cache first
    const memEntry = memoryIdempotencyCache.get(cacheKey);
    if (memEntry && memEntry.expiresAt > Date.now()) {
      const notif = await dbService.getNotificationById(memEntry.notificationId);
      if (notif) {
        return {
          isDuplicate: true,
          existingNotification: notif,
        };
      }
    }

    // 2. Check Redis cache if connected
    const redis = getRedisClient();
    if (redis) {
      try {
        const cachedId = await redis.get(cacheKey);
        if (cachedId) {
          const notif = await dbService.getNotificationById(cachedId);
          if (notif) {
            return {
              isDuplicate: true,
              existingNotification: notif,
            };
          }
        }
      } catch (err) {
        // Safe fallback
      }
    }

    // 3. Check Database uniqueness constraint
    const existing = await dbService.findNotificationByIdempotencyKey(applicationId, idempotencyKey);
    if (existing) {
      // Store in memory cache (24h TTL)
      memoryIdempotencyCache.set(cacheKey, {
        notificationId: existing.id,
        expiresAt: Date.now() + 86400 * 1000,
      });

      if (redis) {
        try {
          await redis.set(cacheKey, existing.id, 'EX', 86400);
        } catch {
          // Non-blocking
        }
      }

      return {
        isDuplicate: true,
        existingNotification: existing,
      };
    }

    return { isDuplicate: false };
  },

  /**
   * Atomically registers the processed idempotency key in cache with a 24-hour expiration.
   */
  async registerIdempotencyKey(
    applicationId: string,
    idempotencyKey: string,
    notificationId: string
  ): Promise<void> {
    const cacheKey = `nx:idemp:${applicationId}:${idempotencyKey}`;

    // Store in memory cache
    memoryIdempotencyCache.set(cacheKey, {
      notificationId,
      expiresAt: Date.now() + 86400 * 1000,
    });

    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.set(cacheKey, notificationId, 'EX', 86400);
      } catch {
        // Non-blocking
      }
    }
  },
};
