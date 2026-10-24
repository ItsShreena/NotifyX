import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import {
  getQueueMetrics,
  getRecentQueueJobs,
  retryAllFailedJobs,
  retrySpecificJob,
} from '../queue/notificationQueue.ts';
import { checkRedisHealth } from '../queue/redisClient.ts';
import { dbService } from '../services/dbService.ts';
import { queueActionRateLimiter } from '../security/rateLimiter.ts';

export const queueRouter = Router();

// Secure queue management with developer authentication
queueRouter.use(requireAuth);

/**
 * GET /api/queue/metrics
 * Returns real, authoritative BullMQ & Redis metrics for the dashboard:
 * - Pending jobs
 * - Processing
 * - Delivered
 * - Failed
 * - Retry count
 */
queueRouter.get('/metrics', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [metrics, redisHealth] = await Promise.all([
      getQueueMetrics(),
      checkRedisHealth(),
    ]);

    res.json({
      success: true,
      metrics: {
        pending: metrics.pending,
        processing: metrics.processing,
        delivered: metrics.delivered,
        failed: metrics.failed,
        retryCount: metrics.retryCount,
        delayed: metrics.delayed,
      },
      redis: {
        connected: redisHealth.connected,
        latencyMs: redisHealth.latencyMs,
        host: redisHealth.host,
        port: redisHealth.port,
        error: redisHealth.error,
      },
    });
  } catch (err: any) {
    console.error('Failed to query queue metrics:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve queue metrics.',
    });
  }
});

/**
 * GET /api/queue/jobs
 * Returns recent jobs processed by BullMQ scoped to developer's applications
 */
queueRouter.get('/jobs', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const userApps = await dbService.getApplicationsByUserId(userId);
    const userAppIds = new Set(userApps.map((a) => a.id));

    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const jobs = await getRecentQueueJobs(limit * 2);

    const scopedJobs = [];
    for (const job of jobs) {
      if (job.data?.notificationId) {
        const notif = await dbService.getNotificationById(job.data.notificationId);
        if (notif && userAppIds.has(notif.applicationId)) {
          scopedJobs.push(job);
        }
      }
      if (scopedJobs.length >= limit) break;
    }

    res.json({
      success: true,
      jobs: scopedJobs,
      count: scopedJobs.length,
    });
  } catch (err: any) {
    console.error('Failed to query recent queue jobs:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve queue jobs.',
    });
  }
});

/**
 * POST /api/queue/retry-failed
 * Retries failed jobs belonging to the authenticated developer (rate-limited, tenant-scoped)
 */
queueRouter.post('/retry-failed', queueActionRateLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const retriedCount = await retryAllFailedJobs(userId);
    res.json({
      success: true,
      message: `Retried ${retriedCount} failed jobs.`,
      retriedCount,
    });
  } catch (err: any) {
    console.error('Failed to retry failed jobs:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retry failed jobs.',
    });
  }
});

/**
 * GET /api/queue/dead-letter
 * Returns permanently failed (dead-lettered) notifications with their retry histories,
 * attempt counts, and last errors
 */
queueRouter.get('/dead-letter', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const notifications = await dbService.getNotifications({
      userId,
      status: 'failed',
    });

    res.json({
      success: true,
      failedNotifications: notifications,
      count: notifications.length,
    });
  } catch (err: any) {
    console.error('Failed to query dead-letter notifications:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve dead-letter notifications.',
    });
  }
});

/**
 * POST /api/queue/retry-job/:id
 * Re-queues a specific job into the active queue with tenant authorization verification
 */
queueRouter.post('/retry-job/:id', queueActionRateLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const jobId = req.params.id;
    const notificationId = jobId.startsWith('job_') ? jobId.slice(4) : jobId;

    // Verify job belongs to developer's application
    const notif = await dbService.getNotificationById(notificationId, userId);
    if (!notif) {
      res.status(404).json({
        success: false,
        error: `Job ${jobId} not found or unauthorized to retry.`,
      });
      return;
    }

    const success = await retrySpecificJob(jobId, userId);
    if (!success) {
      res.status(404).json({
        success: false,
        error: `Job ${jobId} not found in failed queue.`,
      });
      return;
    }

    res.json({
      success: true,
      message: `Job ${jobId} re-queued for execution.`,
    });
  } catch (err: any) {
    console.error('Failed to retry job:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to re-queue job.',
    });
  }
});
