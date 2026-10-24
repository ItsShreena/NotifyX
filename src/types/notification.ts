import { DeliveryChannel } from './application';

export type NotificationPriority = 'critical' | 'urgent' | 'high' | 'normal' | 'low';

export type NotificationType =
  | 'ORDER_UPDATE'
  | 'PAYMENT'
  | 'SECURITY'
  | 'COMMENT'
  | 'TASK'
  | 'SYSTEM'
  | 'DEPLOYMENT'
  | 'REMINDER'
  | 'transactional'
  | 'alert'
  | 'marketing'
  | (string & {});

export interface RetryHistoryEntry {
  attempt: number;
  maxAttempts?: number;
  timestamp: string;
  error?: string | null;
  delayMs?: number;
  status: string;
}

export interface NotificationDeliveryInfo {
  id: string;
  notificationId: string;
  channel: string;
  status: 'pending' | 'processing' | 'delivered' | 'failed' | 'skipped' | string;
  statusCode?: number | null;
  attempts: number;
  maxAttempts?: number;
  latencyMs?: number | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  provider?: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  applicationId: string;
  applicationName: string;
  recipientId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  channel: DeliveryChannel;
  status?: string; // pending, delivered, failed, read, retrying
  attemptCount?: number;
  lastError?: string | null;
  idempotencyKey?: string | null;
  retryHistory?: RetryHistoryEntry[];
  deliveries?: NotificationDeliveryInfo[];
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  aiProcessed?: boolean;
  aiCategory?: string | null;
  aiPriority?: string | null;
  aiSummary?: string | null;
  aiShouldGroup?: boolean;
  aiProcessedAt?: string | null;
}

export interface ChannelMetricsCount {
  delivered: number;
  failed: number;
  skipped: number;
  pending: number;
}

export interface ChannelDeliveryStats {
  totalNotifications: number;
  inApp: ChannelMetricsCount;
  email: ChannelMetricsCount;
  push: ChannelMetricsCount;
}

export interface AiAnalyticsStats {
  analyzed: number;
  failures: number;
  highPriority: number;
  criticalPriority: number;
  grouped: number;
  summarized: number;
  total: number;
}

export interface CreateNotificationDTO {
  applicationId: string;
  recipientId: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  channel: DeliveryChannel;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}
