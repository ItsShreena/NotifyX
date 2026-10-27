import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { dbService } from '../services/dbService.ts';
import { addNotificationJob } from '../queue/notificationQueue.ts';
import { idempotencyService } from '../services/idempotencyService.ts';
import { aiService } from '../services/aiService.ts';
import { getEmailProvider } from '../channels/providers/emailProvider.ts';
import { consoleNotificationRateLimiter, aiReanalyzeRateLimiter } from '../security/rateLimiter.ts';

export const notificationRouter = Router();

const SUPPORTED_CHANNELS = ['in_app', 'email', 'push', 'multi_channel'] as const;

notificationRouter.use(requireAuth);

function normalizeRequestedChannel(channel: unknown): string | undefined {
  if (typeof channel !== 'string') return undefined;
  const normalized = channel.trim().toLowerCase();
  return SUPPORTED_CHANNELS.includes(normalized as (typeof SUPPORTED_CHANNELS)[number]) ? normalized : undefined;
}

/**
 * Temporary admin-only diagnostics endpoint for production debugging.
 * Requires EMAIL_DIAGNOSTIC_ENABLED=true and an email listed in ADMIN_EMAILS.
 */
notificationRouter.post('/diagnostic/test-email', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (process.env.EMAIL_DIAGNOSTIC_ENABLED !== 'true') {
      res.status(404).json({
        success: false,
        error: 'Diagnostic endpoint is disabled.',
      });
      return;
    }

    const allowedAdmins = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    const callerEmail = req.developer?.email?.trim().toLowerCase();

    if (!callerEmail || !allowedAdmins.includes(callerEmail)) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: only configured admins can trigger a diagnostic email.',
      });
      return;
    }

    const provider = getEmailProvider();
    const result = await provider.sendEmail({
      to: 'delivered@resend.dev',
      subject: 'NotifyX Diagnostic Email',
      body: `This is a diagnostic email sent from NotifyX using the active ${provider.name} adapter. Triggered by ${callerEmail} at ${new Date().toISOString()}.`,
      notificationId: `diag_${Date.now()}`,
      metadata: {
        source: 'diagnostic',
        adminEmail: callerEmail,
      },
    });

    if (!result.delivered) {
      res.status(502).json({
        success: false,
        provider: result.provider,
        statusCode: result.statusCode,
        error: result.error || 'Diagnostic email send failed.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      provider: result.provider,
      messageId: result.messageId,
      statusCode: result.statusCode,
      delivered: true,
      recipient: 'delivered@resend.dev',
      message: 'Diagnostic email sent successfully using the active provider adapter.',
    });
  } catch (err: any) {
    console.error('Failed to send diagnostic email:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to send diagnostic email.',
    });
  }
});

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
    const requestedChannel = normalizeRequestedChannel(channel);

    if (channel !== undefined && !requestedChannel) {
      res.status(400).json({
        success: false,
        error: 'Unsupported channel value. Supported channels are: in_app, email, push, multi_channel.',
      });
      return;
    }

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
      channel: requestedChannel || 'in_app',
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
      channel: requestedChannel || 'in_app',
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
