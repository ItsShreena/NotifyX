import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { dbService } from '../services/dbService.ts';
import { addNotificationJob } from '../queue/notificationQueue.ts';
import { idempotencyService } from '../services/idempotencyService.ts';
import { aiService } from '../services/aiService.ts';
import { consoleNotificationRateLimiter, aiReanalyzeRateLimiter } from '../security/rateLimiter.ts';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);

/**
 * GET /api/notifications
 * Lists notifications across the developer's applications.
 */
notificationRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const { applicationId, recipientId, status } = req.query;

    const notifications = await dbService.getNotifications({
      userId,
      applicationId: applicationId as string | undefined,
      recipientId: recipientId as string | undefined,
      status: status as string | undefined,
    });

    res.json({
      success: true,
      notifications,
    });
  } catch (err) {
    console.error('Failed to query notifications:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to query notifications.',
    });
  }
});

/**
 * POST /api/notifications
 * Dispatches an event, records the Notification and initial NotificationDelivery attempt.
 */
notificationRouter.post('/', consoleNotificationRateLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const { applicationId, recipientId, type, title, message, priority, channel, actionUrl, metadata } = req.body;

    if (!applicationId || !recipientId || !title || !message) {
      res.status(400).json({
        success: false,
        error: 'applicationId, recipientId, title, and message are required.',
      });
      return;
    }

    if (typeof recipientId !== 'string' || !recipientId.trim() || recipientId.trim().length > 255) {
      res.status(400).json({
        success: false,
        error: 'recipientId must be a non-empty string under 255 characters.',
      });
      return;
    }

    const VALID_PRIORITIES = ['low', 'normal', 'high', 'critical'];
    if (priority !== undefined && (!VALID_PRIORITIES.includes(String(priority).toLowerCase()))) {
      res.status(400).json({
        success: false,
        error: `Invalid priority value "${priority}". Permitted values: ${VALID_PRIORITIES.join(', ')}.`,
      });
      return;
    }

    if (typeof title === 'string' && title.trim().length > 200) {
      res.status(400).json({
        success: false,
        error: 'Notification title exceeds maximum length of 200 characters.',
      });
      return;
    }

    if (typeof message === 'string' && message.trim().length > 5000) {
      res.status(400).json({
        success: false,
        error: 'Notification message exceeds maximum length of 5000 characters.',
      });
      return;
    }

    // Verify application ownership (Tenant isolation)
    const app = await dbService.getApplicationById(applicationId, userId);
    if (!app) {
      res.status(403).json({
        success: false,
        error: 'Unauthorized: The specified application does not belong to your developer account.',
      });
      return;
    }

    const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body.idempotencyKey;
    const idempotencyKey = rawKey ? String(rawKey).trim() : undefined;

    if (idempotencyKey) {
      const idempCheck = await idempotencyService.checkIdempotency(applicationId, idempotencyKey);
      if (idempCheck.isDuplicate && idempCheck.existingNotification) {
        res.setHeader('Idempotent-Replay', 'true');
        res.status(200).json({
          success: true,
          idempotentReplay: true,
          idempotencyKey,
          notification: idempCheck.existingNotification,
          message: 'Duplicate request detected. Returned original notification without creating duplicate.',
        });
        return;
      }
    }

    const created = await dbService.createNotification({
      applicationId,
      recipientId,
      type: type || 'transactional',
      title: title.trim(),
      message: message.trim(),
      priority: priority || 'normal',
      channel: channel || 'in_app',
      actionUrl,
      metadata,
      initialStatus: 'pending',
      idempotencyKey,
    });

    if (idempotencyKey) {
      await idempotencyService.registerIdempotencyKey(applicationId, idempotencyKey, created.id);
    }

    // Enqueue for asynchronous background worker processing
    await addNotificationJob({
      notificationId: created.id,
      recipientId: created.recipientId,
      channel: channel || 'in_app',
    });

    res.status(201).json({
      success: true,
      notification: created,
      queued: true,
      message: 'Notification stored and queued for asynchronous background delivery.',
    });
  } catch (err) {
    console.error('Failed to dispatch notification:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to dispatch notification.',
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Marks a notification as read (tenant-scoped).
 */
notificationRouter.patch('/:id/read', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const id = req.params.id;
    const updated = await dbService.markNotificationRead(id, userId);
    if (!updated) {
      res.status(404).json({
        success: false,
        error: 'Notification not found or unauthorized.',
      });
      return;
    }
    res.json({
      success: true,
      notification: updated,
    });
  } catch (err) {
    console.error('Failed to mark notification read:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification status.',
    });
  }
});

/**
 * POST /api/notifications/mark-all-read
 * Marks all notifications for developer's applications as read.
 */
notificationRouter.post('/mark-all-read', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const result = await dbService.markAllNotificationsRead(userId);
    res.json({
      success: true,
      result,
    });
  } catch (err) {
    console.error('Failed to mark all notifications read:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications read.',
    });
  }
});

/**
 * GET /api/notifications/ai-stats
 * Returns real AI analytics for the dashboard:
 * - AI analyzed notifications
 * - AI analysis failures
 * - High priority notifications
 * - Critical notifications
 * - Notifications grouped
 * - Notifications summarized
 */
notificationRouter.get('/ai-stats', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const stats = await dbService.getAiAnalytics(userId);
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    console.error('Failed to get AI analytics:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve AI analytics.',
    });
  }
});

/**
 * GET /api/notifications/channel-stats
 * Real database metrics for multi-channel transport:
 * In-App, Email, and Push deliveries (Delivered, Failed, Skipped)
 */
notificationRouter.get('/channel-stats', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const stats = await dbService.getChannelDeliveryStats(userId);
    res.json({
      success: true,
      stats,
    });
  } catch (err: any) {
    console.error('Failed to get channel delivery analytics:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve channel delivery analytics.',
    });
  }
});

/**
 * POST /api/notifications/:id/reanalyze
 * Explicitly triggers AI Notification Intelligence on an existing notification (rate-limited, tenant-scoped).
 */
notificationRouter.post('/:id/reanalyze', aiReanalyzeRateLimiter, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const id = req.params.id;
    const notification = await dbService.getNotificationById(id, userId);
    if (!notification) {
      res.status(404).json({
        success: false,
        error: 'Notification not found or unauthorized.',
      });
      return;
    }

    const aiResult = await aiService.analyzeNotification({
      title: notification.title,
      message: notification.message,
      type: notification.type,
      priority: notification.priority,
      metadata: (notification.metadata as any) || null,
    });

    const updated = await dbService.updateNotificationAiMetadata(id, {
      aiCategory: aiResult.category,
      aiPriority: aiResult.priority,
      aiSummary: aiResult.summary,
      aiShouldGroup: aiResult.shouldGroup,
      finalPriority: aiResult.finalPriority,
      finalType: aiResult.finalCategory,
    });

    res.json({
      success: true,
      notification: updated,
      aiResult,
    });
  } catch (err: any) {
    console.error('Failed to reanalyze notification with AI:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to reanalyze notification.',
    });
  }
});

/**
 * GET /api/notifications/:id
 * Retrieves a single notification with delivery status and AI metadata (tenant-scoped).
 */
notificationRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const id = req.params.id;
    const notification = await dbService.getNotificationById(id, userId);
    if (!notification) {
      res.status(404).json({
        success: false,
        error: 'Notification not found or unauthorized.',
      });
      return;
    }
    res.json({
      success: true,
      notification,
    });
  } catch (err) {
    console.error('Failed to fetch notification by ID:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve notification.',
    });
  }
});
