import type { Request, Response, NextFunction } from 'express';
import { getRedisClient, isRedisReachable } from '../queue/redisClient.ts';
import { auditLogService } from './auditLogService.ts';

export interface RateLimitOptions {
  namespace: string;
  windowMs: number; // Duration of window in milliseconds (e.g. 60000 for 1 min)
  maxRequests: number | ((req: Request) => number | Promise<number>); // Max requests permitted in window
  keyGenerator: (req: Request) => string; // Identity identifier (e.g. IP address or application ID)
  errorMessage?: string;
  errorCode?: string;
  auditOnLimit?: boolean;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  resetSeconds: number;
  retryAfter: number;
}

// In-memory sliding window fallback store if Redis is temporarily offline or unavailable
interface MemoryBucket {
  count: number;
  resetAt: number;
}
const memoryBuckets = new Map<string, MemoryBucket>();

// Periodic memory bucket garbage collector to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of memoryBuckets.entries()) {
    if (now >= bucket.resetAt) {
      memoryBuckets.delete(key);
    }
  }
}, 30000);

/**
 * Checks and increments rate limit counter for a specific key.
 * Uses Redis atomic commands (INCR + EXPIRE) when available;
 * falls back to an in-memory fixed-window bucket when Redis is down.
 */
export async function checkRateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitCheckResult> {
  const redisKey = `rl:${namespace}:${key}`;
  const windowSeconds = Math.ceil(windowMs / 1000);
  const redis = getRedisClient();

  if (redis && redis.status === 'ready') {
    try {
      // Atomic Redis Multi Pipeline
      const pipeline = redis.pipeline();
      pipeline.incr(redisKey);
      pipeline.ttl(redisKey);
      const results = await pipeline.exec();

      if (results && results[0] && results[1]) {
        const count = results[0][1] as number;
        let ttl = results[1][1] as number;

        // If newly created key or key without expiry, set TTL
        if (count === 1 || ttl === -1) {
          await redis.expire(redisKey, windowSeconds);
          ttl = windowSeconds;
        }

        const resetSeconds = Math.max(1, ttl > 0 ? ttl : windowSeconds);
        const remaining = Math.max(0, limit - count);
        const allowed = count <= limit;

        return {
          allowed,
          limit,
          current: count,
          remaining,
          resetSeconds,
          retryAfter: allowed ? 0 : resetSeconds,
        };
      }
    } catch {
      // Fallback silently to memory store below
    }
  }

  // Graceful In-Memory Fallback
  const now = Date.now();
  let bucket = memoryBuckets.get(redisKey);

  if (!bucket || now >= bucket.resetAt) {
    bucket = {
      count: 1,
      resetAt: now + windowMs,
    };
    memoryBuckets.set(redisKey, bucket);
  } else {
    bucket.count++;
  }

  const remainingMs = Math.max(1000, bucket.resetAt - now);
  const resetSeconds = Math.ceil(remainingMs / 1000);
  const remaining = Math.max(0, limit - bucket.count);
  const allowed = bucket.count <= limit;

  return {
    allowed,
    limit,
    current: bucket.count,
    remaining,
    resetSeconds,
    retryAfter: allowed ? 0 : resetSeconds,
  };
}

/**
 * Creates an Express middleware to enforce distributed rate limiting with standard RFC headers.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    namespace,
    windowMs,
    maxRequests,
    keyGenerator,
    errorMessage = 'Too many requests. Please try again later.',
    errorCode = 'RATE_LIMIT_EXCEEDED',
    auditOnLimit = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = keyGenerator(req);
      const limit = typeof maxRequests === 'function' ? await maxRequests(req) : maxRequests;

      const result = await checkRateLimit(namespace, key, limit, windowMs);

      // Attach standard rate limit headers
      res.setHeader('X-RateLimit-Limit', result.limit.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader(
        'X-RateLimit-Reset',
        Math.floor(Date.now() / 1000 + result.resetSeconds).toString()
      );

      if (!result.allowed) {
        res.setHeader('Retry-After', result.retryAfter.toString());

        if (auditOnLimit) {
          const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
          const userAgent = (req.headers['user-agent'] as string) || 'unknown';
          const appId = (req as any).application?.id || undefined;
          const userId = (req as any).developer?.id || undefined;

          auditLogService.logEvent({
            eventType: 'rate_limit_exceeded',
            userId,
            applicationId: appId,
            ipAddress: clientIp,
            userAgent,
            metadata: {
              namespace,
              key,
              limit: result.limit,
              current: result.current,
              endpoint: req.originalUrl,
              method: req.method,
            },
          }).catch(() => {});
        }

        res.status(429).json({
          error: errorCode,
          message: errorMessage,
          retryAfter: result.retryAfter,
        });
        return;
      }

      next();
    } catch (err) {
      console.error('Rate limiting middleware error:', err);
      // Fail safely to not disrupt valid user traffic
      next();
    }
  };
}

// -------------------------------------------------------------
// Specialized Rate Limiters
// -------------------------------------------------------------

/**
 * Application-level rate limiter on external notification APIs.
 * Identity is the authenticated application ID.
 * Defaults to 100 requests per minute or application-specific rateLimitPerSec * 60.
 */
export const externalNotificationRateLimiter = createRateLimiter({
  namespace: 'app_notify',
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  maxRequests: (req: Request) => {
    const app = (req as any).application;
    if (app && app.rateLimitPerSec) {
      return Math.max(10, app.rateLimitPerSec * 60);
    }
    return Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
  },
  keyGenerator: (req: Request) => {
    const app = (req as any).application;
    if (app && app.id) return `app_${app.id}`;
    return (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  },
  errorMessage: 'Rate limit exceeded for this application. Please throttle your requests.',
  errorCode: 'RATE_LIMIT_EXCEEDED',
  auditOnLimit: true,
});

/**
 * Authentication brute-force protection rate limiter for /api/auth/login and /api/auth/signup.
 * Limits failed or repeated attempts to 5 per 15 minutes per IP address.
 */
export const authRateLimiter = createRateLimiter({
  namespace: 'auth_protection',
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: Number(process.env.AUTH_RATE_LIMIT_MAX) || 5,
  keyGenerator: (req: Request) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const email = req.body?.email ? String(req.body.email).toLowerCase().trim() : '';
    return email ? `${ip}_${email}` : ip;
  },
  errorMessage: 'Too many authentication attempts. Please try again later.',
  errorCode: 'AUTH_RATE_LIMIT_EXCEEDED',
  auditOnLimit: true,
});

/**
 * Developer console notification dispatch rate limiter (60 requests/min per developer).
 */
export const consoleNotificationRateLimiter = createRateLimiter({
  namespace: 'console_notify',
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyGenerator: (req: Request) => {
    const user = (req as any).developer;
    if (user && user.id) return `user_${user.id}`;
    return (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  },
  errorMessage: 'Rate limit exceeded for developer console dispatches. Please slow down.',
  errorCode: 'RATE_LIMIT_EXCEEDED',
  auditOnLimit: true,
});

/**
 * AI Notification Intelligence re-analysis rate limiter (15 requests/min per developer).
 * Protects against Gemini API quota exhaustion and denial-of-service.
 */
export const aiReanalyzeRateLimiter = createRateLimiter({
  namespace: 'ai_reanalyze',
  windowMs: 60 * 1000,
  maxRequests: 15,
  keyGenerator: (req: Request) => {
    const user = (req as any).developer;
    if (user && user.id) return `user_${user.id}`;
    return (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  },
  errorMessage: 'AI re-analysis rate limit exceeded. Please wait before submitting more requests.',
  errorCode: 'AI_RATE_LIMIT_EXCEEDED',
  auditOnLimit: true,
});

/**
 * Queue management action rate limiter (10 operations/min per developer).
 */
export const queueActionRateLimiter = createRateLimiter({
  namespace: 'queue_action',
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyGenerator: (req: Request) => {
    const user = (req as any).developer;
    if (user && user.id) return `user_${user.id}`;
    return (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  },
  errorMessage: 'Queue management rate limit exceeded. Please wait before attempting again.',
  errorCode: 'QUEUE_RATE_LIMIT_EXCEEDED',
  auditOnLimit: true,
});
