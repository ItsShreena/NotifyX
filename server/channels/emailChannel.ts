import type { NotificationChannel, ChannelName, NotificationPayload, RecipientInfo, ChannelDeliveryResult } from './types.ts';
import { getEmailProvider } from './providers/emailProvider.ts';

/**
 * Email Channel Adapter:
 * Uses EmailProvider abstraction to dispatch emails without hardcoding downstream providers.
 */
export class EmailChannel implements NotificationChannel {
  readonly name: ChannelName = 'email';

  async send(notification: NotificationPayload, recipient: RecipientInfo): Promise<ChannelDeliveryResult> {
    const start = Date.now();
    const emailProvider = getEmailProvider();

    // Resolve destination email: recipient.email > email-formatted recipient id > fallback dev email
    const toEmail = recipient.email || (recipient.id.includes('@') ? recipient.id : `${recipient.id}@notifyx.dev`);

    const subject = notification.priority.toLowerCase() === 'critical'
      ? `[URGENT] ${notification.title}`
      : notification.title;

    // Use concise factual AI summary if available, otherwise full message
    const bodyContent = notification.aiSummary
      ? `${notification.aiSummary}\n\n(Details: ${notification.message})`
      : notification.message;

    try {
      const result = await emailProvider.sendEmail({
        to: toEmail,
        subject,
        body: bodyContent,
        notificationId: notification.id,
        category: notification.aiCategory || notification.type,
        priority: notification.priority,
        metadata: notification.metadata,
      });

      if (!result.delivered) {
        return {
          channel: 'email',
          delivered: false,
          skipped: false,
          provider: result.provider,
          statusCode: result.statusCode || 500,
          latencyMs: Date.now() - start,
          failedAt: new Date(),
          error: result.error || 'Email dispatch failed at carrier provider',
        };
      }

      return {
        channel: 'email',
        delivered: true,
        skipped: false,
        provider: result.provider,
        statusCode: result.statusCode || 200,
        latencyMs: Date.now() - start,
        deliveredAt: new Date(),
        details: { messageId: result.messageId, to: toEmail },
      };
    } catch (err: any) {
      return {
        channel: 'email',
        delivered: false,
        skipped: false,
        provider: emailProvider.name,
        statusCode: 500,
        latencyMs: Date.now() - start,
        failedAt: new Date(),
        error: err.message || 'Unhandled email provider exception',
      };
    }
  }
}
