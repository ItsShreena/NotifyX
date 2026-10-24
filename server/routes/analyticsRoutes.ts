import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { analyticsService } from '../services/analyticsService.ts';

export const analyticsRouter = Router();

// Strict Developer authentication protects all analytics telemetry endpoints
analyticsRouter.use(requireAuth);

/**
 * GET /api/analytics/overview
 * Real aggregate metrics: total notifications, delivered, failed, pending, skipped, success rate, latency, retries.
 */
analyticsRouter.get('/overview', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const range = (req.query.range as string) || '7d';
    const overview = await analyticsService.getOverview(userId, range);

    res.json({
      success: true,
      data: overview,
    });
  } catch (err: any) {
    console.error('Failed to get analytics overview:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve analytics overview.',
    });
  }
});

/**
 * GET /api/analytics/timeline
 * Time series volume grouped into discrete hourly/daily buckets.
 */
analyticsRouter.get('/timeline', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const range = (req.query.range as string) || '7d';
    const timeline = await analyticsService.getNotificationTimeline(userId, range);

    res.json({
      success: true,
      data: timeline,
    });
  } catch (err: any) {
    console.error('Failed to get notification timeline:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve notification timeline.',
    });
  }
});

/**
 * GET /api/analytics/delivery
 * NotificationDelivery metrics, latency benchmarks, and retry statistics.
 */
analyticsRouter.get('/delivery', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const range = (req.query.range as string) || '7d';

    const [delivery, latency, retries, failures] = await Promise.all([
      analyticsService.getDeliveryAnalytics(userId, range),
      analyticsService.getDeliveryLatency(userId, range),
      analyticsService.getRetryAnalytics(userId, range),
      analyticsService.getFailureAnalytics(userId, range),
    ]);

    res.json({
      success: true,
      data: {
        delivery,
        latency,
        retries,
        failures,
      },
    });
  } catch (err: any) {
    console.error('Failed to get delivery analytics:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve delivery analytics.',
    });
  }
});

/**
 * GET /api/analytics/channels
 * Breakdown and comparison across In-App, Email, and Push channels.
 */
analyticsRouter.get('/channels', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const range = (req.query.range as string) || '7d';
    const channels = await analyticsService.getChannelAnalytics(userId, range);

    res.json({
      success: true,
      data: channels,
    });
  } catch (err: any) {
    console.error('Failed to get channel analytics:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve channel analytics.',
    });
  }
});

/**
 * GET /api/analytics/applications
 * Usage and success rates aggregated by connected application.
 */
analyticsRouter.get('/applications', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const range = (req.query.range as string) || '7d';
    const applications = await analyticsService.getApplicationAnalytics(userId, range);

    res.json({
      success: true,
      data: applications,
    });
  } catch (err: any) {
    console.error('Failed to get application analytics:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve application analytics.',
    });
  }
});

/**
 * GET /api/analytics/ai
 * AI Notification Intelligence classification accuracy, priority distribution, and summary stats.
 */
analyticsRouter.get('/ai', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const range = (req.query.range as string) || '7d';
    const ai = await analyticsService.getAIAnalytics(userId, range);

    res.json({
      success: true,
      data: ai,
    });
  } catch (err: any) {
    console.error('Failed to get AI analytics:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve AI analytics.',
    });
  }
});

/**
 * GET /api/analytics/queue
 * BullMQ & Redis / Embedded queue job states and worker health.
 */
analyticsRouter.get('/queue', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const queue = await analyticsService.getQueueAnalytics();

    res.json({
      success: true,
      data: queue,
    });
  } catch (err: any) {
    console.error('Failed to get queue analytics:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve queue analytics.',
    });
  }
});

/**
 * GET /api/analytics/health
 * System health and component status (API, PostgreSQL, Redis, Worker, WebSocket, AI).
 */
analyticsRouter.get('/health', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const health = await analyticsService.getHealth();

    res.json({
      success: true,
      data: health,
    });
  } catch (err: any) {
    console.error('Failed to get system health:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve system health.',
    });
  }
});

/**
 * GET /api/analytics/activity
 * Chronological recent activity stream for notifications, dispatches, retries, and apps.
 */
analyticsRouter.get('/activity', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const activity = await analyticsService.getRecentActivity(userId, limit);

    res.json({
      success: true,
      data: activity,
    });
  } catch (err: any) {
    console.error('Failed to get recent activity:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve recent activity.',
    });
  }
});
