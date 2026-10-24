export type ChannelName = 'in_app' | 'email' | 'push';

export type DeliveryStatus = 'pending' | 'processing' | 'delivered' | 'failed' | 'skipped';

export interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  priority: string;
  type: string;
  applicationId: string;
  applicationName?: string;
  appOwnerUserId?: string;
  metadata?: Record<string, unknown>;
  actionUrl?: string | null;
  aiProcessed?: boolean;
  aiCategory?: string | null;
  aiPriority?: string | null;
  aiSummary?: string | null;
  aiShouldGroup?: boolean;
}

export interface RecipientInfo {
  id: string;
  email?: string;
  deviceToken?: string;
}

export interface ChannelDeliveryResult {
  channel: ChannelName;
  delivered: boolean;
  skipped: boolean;
  provider: string;
  statusCode: number;
  latencyMs: number;
  deliveredAt?: Date;
  failedAt?: Date;
  error?: string;
  skipReason?: string;
  details?: Record<string, unknown>;
}

/**
 * Common delivery interface/contract implemented by all notification channels.
 * Enables clean addition of future channels (SMS, Slack, Discord, WhatsApp)
 * without rewriting the notification engine.
 */
export interface NotificationChannel {
  readonly name: ChannelName;
  send(notification: NotificationPayload, recipient: RecipientInfo): Promise<ChannelDeliveryResult>;
}
