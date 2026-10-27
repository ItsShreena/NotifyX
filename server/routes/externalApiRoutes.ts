import { Router } from 'express';
import type { Response } from 'express';
import { validateApiKey } from '../middleware/apiKeyAuthMiddleware.ts';
import type { ExternalApplicationRequest } from '../middleware/apiKeyAuthMiddleware.ts';
import { dbService } from '../services/dbService.ts';
import { addNotificationJob } from '../queue/notificationQueue.ts';
import { idempotencyService } from '../services/idempotencyService.ts';
import { externalNotificationRateLimiter } from '../security/rateLimiter.ts';

export const externalApiRouter = Router();

// Secure all /api/v1 routes using validateApiKey middleware
externalApiRouter.use(validateApiKey);

// Supported priorities
const VALID_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
type Priority = (typeof VALID_PRIORITIES)[number];

// Supported standard notification types (system is extensible to any non-empty string)
export const STANDARD_NOTIFICATION_TYPES = [
  'ORDER_UPDATE',
  'PAYMENT',
  'SECURITY',
  'COMMENT',
  'TASK',
  'SYSTEM',
  'DEPLOYMENT',
  'REMINDER',
] as const;

/**
 * GET /api/v1/verify-key
 * Validates API key and returns application profile
 */
externalApiRouter.get('/verify-key', (req: ExternalApplicationRequest, res: Response): void => {
  const app = req.application!;
  res.json({
    success: true,
    authenticated: true,
    application: {
      id: app.id,
      name: app.name,
      environment: app.environment,
      status: app.status,
      apiKeyPreview: app.apiKeyPreview,
      rateLimitPerSec: app.rateLimitPerSec,
    },
    message: 'API key is valid and authorized.',
  });
});

/**
 * POST /api/v1/notifications
 * Main NotifyX Dispatch Endpoint.
 * External applications authenticated with their NotifyX API key call this endpoint.
 */
const SUPPORTED_CHANNELS = ['in_app', 'email', 'push', 'multi_channel'] as const;

const normalizeChannel = (channel: unknown): string | undefined => {
  if (typeof channel !== 'string') return undefined;
  const normalized = channel.trim().toLowerCase();
  return SUPPORTED_CHANNELS.includes(normalized as (typeof SUPPORTED_CHANNELS)[number]) ? normalized : undefined;
};

const createNotificationHandler = async (req: ExternalApplicationRequest, res: Response): Promise<void> => {
  try {
    const app = req.application!;
    const { recipientId, type, title, message, priority, channel, actionUrl, metadata } = req.body;
    const normalizedChannel = normalizeChannel(channel);

    if (channel !== undefined && !normalizedChannel) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Unsupported channel value. Supported channels are: in_app, email, push, multi_channel.',
        fields: { channel: 'Unsupported delivery channel.' },
      });
      return;
    }

    // Field-level validation
    const validationErrors: Record<string, string> = {};

    if (!recipientId || typeof recipientId !== 'string' || !recipientId.trim()) {
      validationErrors.recipientId = 'recipientId is required and must be a non-empty string.';
    }

    if (!type || typeof type !== 'string' || !type.trim()) {
      validationErrors.type =
        'type is required. Examples: ORDER_UPDATE, PAYMENT, SECURITY, COMMENT, TASK, SYSTEM, DEPLOYMENT, REMINDER.';
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      validationErrors.title = 'title is required and must be between 1 and 200 characters.';
    } else if (title.trim().length > 200) {
      validationErrors.title = 'Notification title: maximum 200 characters.';
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      validationErrors.message = 'message is required and must be a non-empty string.';
    } else if (message.trim().length > 5000) {
      validationErrors.message = 'Notification message: maximum 5000 characters.';
    }

    let finalPriority: Priority = 'normal';
    if (priority !== undefined) {
      if (typeof priority !== 'string' || !VALID_PRIORITIES.includes(priority.toLowerCase() as Priority)) {
        validationErrors.priority = `Invalid priority value "${priority}". Permitted values: ${VALID_PRIORITIES.join(', ')}.`;
      } else {
        finalPriority = priority.toLowerCase() as Priority;
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid notification payload.',
        fields: validationErrors,
      });
      return;
    }

    // Normalized notification type (e.g. ORDER_UPDATE)
    const normalizedType = type.trim().toUpperCase();

    // Check for Idempotency-Key in headers or body
    const rawIdempotencyKey = (req.headers['idempotency-key'] ||
      req.headers['x-idempotency-key'] ||
      req.body.idempotencyKey) as string | undefined;
    const idempotencyKey = rawIdempotencyKey ? String(rawIdempotencyKey).trim() : undefined;

    if (idempotencyKey) {
      if (idempotencyKey.length > 128) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Idempotency key exceeds maximum length of 128 characters.',
          fields: { idempotencyKey: 'Max length 128 characters.' },
        });
        return;
      }
      const idempCheck = await idempotencyService.checkIdempotency(app.id, idempotencyKey);
      if (idempCheck.isDuplicate && idempCheck.existingNotification) {
        const existing = idempCheck.existingNotification;
        res.setHeader('Idempotent-Replay', 'true');
        res.status(200).json({
          success: true,
          idempotentReplay: true,
          idempotencyKey,
          notificationId: existing.id,
          status: existing.status,
          recipientId: existing.recipientId,
          type: existing.type,
          title: existing.title,
          priority: existing.priority,
          createdAt: existing.createdAt,
          message: 'Duplicate request detected. Returned original notification without creating duplicate.',
        });
        return;
      }
    }

    // Store notification with initial 'pending' status
    const created = await dbService.createNotification({
      applicationId: app.id,
      recipientId: recipientId.trim(),
      type: normalizedType,
      title: title.trim(),
      message: message.trim(),
      priority: finalPriority,
      channel: normalizedChannel || 'in_app',
      actionUrl: actionUrl?.trim() || undefined,
      metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
      initialStatus: 'pending',
      idempotencyKey,
    });

    // Atomically cache idempotency key in Redis
    if (idempotencyKey) {
      await idempotencyService.registerIdempotencyKey(app.id, idempotencyKey, created.id);
    }

    // Enqueue job for background worker processing via BullMQ & Redis
    await addNotificationJob({
      notificationId: created.id,
      recipientId: created.recipientId,
      channel: normalizedChannel || 'in_app',
    });

    // Fast asynchronous response: does not wait for slow downstream delivery!
    res.status(201).json({
      success: true,
      notificationId: created.id,
      status: 'pending',
      recipientId: created.recipientId,
      type: created.type,
      title: created.title,
      priority: created.priority,
      createdAt: created.createdAt,
    });
  } catch (err) {
    console.error('Core notification dispatch error:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to process and dispatch notification.',
      code: 'DISPATCH_ERROR',
    });
  }
};

externalApiRouter.post('/notifications', externalNotificationRateLimiter, createNotificationHandler);
externalApiRouter.post('/notify', externalNotificationRateLimiter, createNotificationHandler);

/**
 * GET /api/v1/notifications
 * Retrieves notifications dispatched by this application with optional filters
 */
externalApiRouter.get('/notifications', async (req: ExternalApplicationRequest, res: Response): Promise<void> => {
  try {
    const app = req.application!;
    const { recipientId, status, type, priority, limit, offset } = req.query;

    const result = await dbService.getNotificationsForApp(app.id, {
      recipientId: recipientId as string | undefined,
      status: status as string | undefined,
      type: type ? (type as string).toUpperCase() : undefined,
      priority: priority as string | undefined,
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
    });

    // Sanitize output
    const sanitized = result.notifications.map((n) => ({
      id: n.id,
      recipientId: n.recipientId,
      idempotencyKey: n.idempotencyKey || null,
      type: n.type,
      title: n.title,
      message: n.message,
      priority: n.priority,
      status: n.status,
      attemptCount: n.attemptCount || 1,
      lastError: n.lastError || null,
      retryHistory: n.retryHistory || [],
      readAt: n.readAt,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));

    res.json({
      success: true,
      notifications: sanitized,
      count: result.count,
      total: result.total,
    });
  } catch (err) {
    console.error('Failed to list notifications:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve notifications.',
    });
  }
});

/**
 * GET /api/v1/notifications/:id
 * Retrieves a single notification belonging to this application
 */
externalApiRouter.get('/notifications/:id', async (req: ExternalApplicationRequest, res: Response): Promise<void> => {
  try {
    const app = req.application!;
    const notificationId = req.params.id;

    const notif = await dbService.getNotificationByIdForApp(notificationId, app.id);

    if (!notif) {
      res.status(404).json({
        success: false,
        error: 'Notification not found or does not belong to this application.',
        code: 'NOTIFICATION_NOT_FOUND',
      });
      return;
    }

    res.json({
      success: true,
      notification: {
        id: notif.id,
        recipientId: notif.recipientId,
        idempotencyKey: notif.idempotencyKey || null,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        priority: notif.priority,
        status: notif.status,
        attemptCount: notif.attemptCount || 1,
        lastError: notif.lastError || null,
        retryHistory: notif.retryHistory || [],
        readAt: notif.readAt,
        actionUrl: notif.actionUrl,
        metadata: notif.metadata,
        createdAt: notif.createdAt,
        updatedAt: notif.updatedAt,
      },
    });
  } catch (err) {
    console.error('Failed to retrieve notification:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve notification.',
    });
  }
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Marks a notification as read (must belong to this application)
 */
externalApiRouter.patch('/notifications/:id/read', async (req: ExternalApplicationRequest, res: Response): Promise<void> => {
  try {
    const app = req.application!;
    const notificationId = req.params.id;

    const updated = await dbService.markNotificationReadForApp(notificationId, app.id);

    res.json({
      success: true,
      notificationId: updated.id,
      status: updated.status,
      readAt: updated.readAt,
      message: 'Notification marked as read.',
    });
  } catch (err) {
    console.error('Failed to mark notification read:', err);
    res.status(404).json({
      success: false,
      error: 'Notification not found or unauthorized to update.',
      code: 'NOTIFICATION_NOT_FOUND',
    });
  }
});
