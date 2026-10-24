import { dbService } from './dbService.ts';
import { addNotificationJob } from '../queue/notificationQueue.ts';
import { idempotencyService } from './idempotencyService.ts';
import { normalizeCategory } from './preferenceService.ts';

export class NotificationBackendService {
  /**
   * Stores a notification and queues it for asynchronous worker processing.
   */
  async createAndQueueNotification(params: {
    applicationId: string;
    recipientId: string;
    type: string;
    title: string;
    message: string;
    priority?: string;
    channel?: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const {
      applicationId,
      recipientId,
      type,
      title,
      message,
      priority = 'normal',
      channel = 'in_app',
      actionUrl,
      metadata,
      idempotencyKey,
    } = params;

    const normalizedCategory = normalizeCategory(type);

    // 1. Idempotency check if idempotencyKey provided
    if (idempotencyKey) {
      const check = await idempotencyService.checkIdempotency(applicationId, idempotencyKey);
      if (check.isDuplicate && check.existingNotification) {
        return {
          isDuplicate: true,
          notification: check.existingNotification,
        };
      }
    }

    // 2. Store in Database with initial 'pending' status
    const created = await dbService.createNotification({
      applicationId,
      recipientId,
      type: type.trim().toUpperCase(),
      title: title.trim(),
      message: message.trim(),
      priority,
      channel,
      actionUrl,
      metadata: {
        ...(metadata || {}),
        category: normalizedCategory,
      },
      initialStatus: 'pending',
      idempotencyKey,
    });

    // 3. Register idempotency key
    if (idempotencyKey) {
      await idempotencyService.registerIdempotencyKey(applicationId, idempotencyKey, created.id);
    }

    // 4. Enqueue job into BullMQ
    await addNotificationJob({
      notificationId: created.id,
      recipientId: created.recipientId,
      channel,
    });

    return {
      isDuplicate: false,
      notification: created,
    };
  }

  async getNotifications(options: {
    userId: string;
    applicationId?: string;
    status?: string;
    type?: string;
    priority?: string;
    limit?: number;
    offset?: number;
  }) {
    return await dbService.getNotifications(options);
  }

  async getNotificationById(id: string) {
    return await dbService.getNotificationById(id);
  }

  async markRead(id: string) {
    return await dbService.markNotificationRead(id);
  }

  async markAllRead(userId: string) {
    return await dbService.markAllNotificationsRead(userId);
  }
}

export const notificationBackendService = new NotificationBackendService();
