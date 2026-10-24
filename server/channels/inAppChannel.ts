import type { NotificationChannel, ChannelName, NotificationPayload, RecipientInfo, ChannelDeliveryResult } from './types.ts';
import { emitNotificationToUser } from '../realtime/websocketServer.ts';

/**
 * In-App Channel Adapter:
 * Broadcasts notifications via WebSocket to connected recipients.
 * When a user is offline, the notification remains safely stored in PostgreSQL/database,
 * allowing the frontend to retrieve unread notifications upon reconnecting without duplicate dispatches.
 */
export class InAppChannel implements NotificationChannel {
  readonly name: ChannelName = 'in_app';

  async send(notification: NotificationPayload, recipient: RecipientInfo): Promise<ChannelDeliveryResult> {
    const start = Date.now();
    const isCritical = notification.priority.toLowerCase() === 'critical';

    const payload = {
      id: notification.id,
      title: isCritical ? `🚨 ${notification.title}` : notification.title,
      message: notification.message,
      priority: notification.priority,
      createdAt: new Date().toISOString(),
      recipientId: recipient.id,
      type: notification.type,
      applicationId: notification.applicationId,
      applicationName: notification.applicationName || 'NotifyX App',
      channel: 'in_app',
      isCritical,
      actionUrl: notification.actionUrl,
      metadata: notification.metadata,
      aiProcessed: Boolean(notification.aiProcessed),
      aiCategory: notification.aiCategory || null,
      aiPriority: notification.aiPriority || null,
      aiSummary: notification.aiSummary || null,
      aiShouldGroup: Boolean(notification.aiShouldGroup),
    };

    // Emit to active WebSocket subscribers (both app owner and recipient if distinct)
    if (notification.appOwnerUserId) {
      emitNotificationToUser(notification.appOwnerUserId, payload);
    }
    if (recipient.id && recipient.id !== notification.appOwnerUserId) {
      emitNotificationToUser(recipient.id, payload);
    }

    const latencyMs = Math.max(1, Date.now() - start);

    return {
      channel: 'in_app',
      delivered: true,
      skipped: false,
      provider: 'InAppWebSocket',
      statusCode: 200,
      latencyMs,
      deliveredAt: new Date(),
    };
  }
}
