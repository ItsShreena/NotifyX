import type { NotificationChannel, ChannelName, NotificationPayload, RecipientInfo, ChannelDeliveryResult } from './types.ts';
import { getPushProvider } from './providers/pushProvider.ts';

/**
 * Push Channel Adapter:
 * Uses PushProvider abstraction to dispatch mobile/web pushes without coupling to FCM or APNs.
 */
export class PushChannel implements NotificationChannel {
  readonly name: ChannelName = 'push';

  async send(notification: NotificationPayload, recipient: RecipientInfo): Promise<ChannelDeliveryResult> {
    const start = Date.now();
    const pushProvider = getPushProvider();

    const title = notification.priority.toLowerCase() === 'critical'
      ? `🚨 ${notification.title}`
      : notification.title;

    // Use AI summary for push notification body (push notifications require short, punchy copy)
    const body = notification.aiSummary || notification.message;

    try {
      const result = await pushProvider.sendPush({
        recipientId: recipient.id,
        title,
        body,
        deviceToken: recipient.deviceToken,
        notificationId: notification.id,
        priority: notification.priority,
        category: notification.aiCategory || notification.type,
        data: notification.metadata,
      });

      if (!result.delivered) {
        return {
          channel: 'push',
          delivered: false,
          skipped: false,
          provider: result.provider,
          statusCode: result.statusCode || 500,
          latencyMs: Date.now() - start,
          failedAt: new Date(),
          error: result.error || 'Push dispatch rejected by push gateway',
        };
      }

      return {
        channel: 'push',
        delivered: true,
        skipped: false,
        provider: result.provider,
        statusCode: result.statusCode || 200,
        latencyMs: Date.now() - start,
        deliveredAt: new Date(),
        details: { messageId: result.messageId, recipientId: recipient.id },
      };
    } catch (err: any) {
      return {
        channel: 'push',
        delivered: false,
        skipped: false,
        provider: pushProvider.name,
        statusCode: 500,
        latencyMs: Date.now() - start,
        failedAt: new Date(),
        error: err.message || 'Unhandled push provider exception',
      };
    }
  }
}
