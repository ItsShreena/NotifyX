import { Router } from 'express';
import type { Request, Response } from 'express';
import { isDatabaseConnected } from '../db/prisma.ts';
import { checkRedisHealth } from '../queue/redisClient.ts';
import { isWorkerActive } from '../queue/notificationWorker.ts';
import { getActiveQueueEngine } from '../queue/notificationQueue.ts';

export const healthRouter = Router();

/**
 * GET /api/health
 * Comprehensive production health check:
 * Returns: {
 *   "status": "healthy" | "degraded",
 *   "api": "ok",
 *   "database": "ok" | "degraded",
 *   "redis": "ok" | "fallback",
 *   "queue": { "status": "ok", "engine": "BullMQ (Redis)" | "EmbeddedQueue (In-Memory)" },
 *   "worker": "ok" | "degraded",
 *   "timestamp": "..."
 * }
 * Never exposes secrets, passwords, or connection strings.
 */
healthRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  const [dbHealthy, redisHealth, queueEngine] = await Promise.all([
    isDatabaseConnected().catch(() => false),
    checkRedisHealth().catch(() => ({ connected: false })),
    getActiveQueueEngine().catch(() => 'EmbeddedQueue (In-Memory)' as const),
  ]);

  const workerStatus = isWorkerActive() ? 'ok' : 'degraded';
  const dbStatus = dbHealthy || !process.env.DATABASE_URL ? 'ok' : 'degraded';
  const redisStatus = redisHealth.connected ? 'ok' : 'fallback';

  const isOverallHealthy = dbStatus === 'ok' && workerStatus === 'ok';

  res.status(isOverallHealthy ? 200 : 503).json({
    status: isOverallHealthy ? 'healthy' : 'degraded',
    api: 'ok',
    service: 'NotifyX',
    database: dbStatus,
    redis: redisStatus,
    queue: {
      status: 'ok',
      engine: queueEngine,
    },
    worker: workerStatus,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/live
 * Liveness probe: returns 200 as long as the Express process is running.
 */
healthRouter.get('/live', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'live',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health/ready
 * Readiness probe: checks if the application is ready to accept user traffic and process jobs.
 */
healthRouter.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  const [dbOk, queueEngine] = await Promise.all([
    isDatabaseConnected().catch(() => false),
    getActiveQueueEngine().catch(() => 'EmbeddedQueue (In-Memory)' as const),
  ]);
  const workerOk = isWorkerActive();
  const ready = (dbOk || !process.env.DATABASE_URL) && workerOk;

  if (ready) {
    res.status(200).json({
      status: 'ready',
      database: dbOk ? 'ok' : 'in-memory',
      queue: queueEngine,
      worker: workerOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      reason: !dbOk ? 'Database unreachable' : 'Worker inactive',
      timestamp: new Date().toISOString(),
    });
  }
});

