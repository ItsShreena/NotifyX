export type TimeRange = '24h' | '7d' | '30d';

export interface AnalyticsOverview {
  timeRange: TimeRange;
  startDate: string;
  totalNotifications: number;
  delivered: number;
  failed: number;
  pending: number;
  skipped: number;
  successRate: number;
  averageDeliveryTimeSec: number;
  averageDeliveryTimeMs: number;
  totalRetries: number;
}

export interface TimelineDataPoint {
  timestamp: string;
  label: string;
  created: number;
  delivered: number;
  failed: number;
}

export interface NotificationTimelineData {
  timeRange: TimeRange;
  timeline: TimelineDataPoint[];
}

export interface DeliveryAnalyticsData {
  totalDeliveries: number;
  delivered: number;
  failed: number;
  pending: number;
  processing: number;
  skipped: number;
  successPercentage: number;
  failurePercentage: number;
}

export interface ChannelLatencyInfo {
  latencyMs: number;
  latencySec: number;
}

export interface DeliveryLatencyData {
  timeRange: TimeRange;
  averageLatencyMs: number;
  averageLatencySec: number;
  fastestDeliveryMs: number;
  slowestDeliveryMs: number;
  byChannel: {
    inApp: ChannelLatencyInfo;
    email: ChannelLatencyInfo;
    push: ChannelLatencyInfo;
  };
}

export interface RetriedNotificationItem {
  id: string;
  title: string;
  recipientId: string;
  applicationName: string;
  attempts: number;
  status: string;
  lastError: string | null;
}

export interface RetryAnalyticsData {
  timeRange: TimeRange;
  totalRetryAttempts: number;
  notificationsRetried: number;
  averageAttemptsPerDelivery: number;
  deadLetterCount: number;
  mostRetried: RetriedNotificationItem[];
}

export interface FailureReasonItem {
  reason: string;
  count: number;
  percentage: number;
}

export interface FailureAnalyticsData {
  timeRange: TimeRange;
  totalFailures: number;
  failureReasons: FailureReasonItem[];
}

export interface ChannelMetricItem {
  channel: 'in_app' | 'email' | 'push' | string;
  label: string;
  total: number;
  delivered: number;
  failed: number;
  skipped: number;
  pending: number;
  successRate: number;
  failureRate: number;
  averageLatencyMs: number;
  averageLatencySec: number;
}

export interface ChannelAnalyticsData {
  timeRange: TimeRange;
  channels: ChannelMetricItem[];
}

export interface ApplicationAnalyticsItem {
  id: string;
  name: string;
  environment: string;
  status: string;
  notificationsCreated: number;
  deliveriesCount: number;
  failedDeliveriesCount: number;
  successRate: number;
  mostUsedChannel: string;
  lastActivityAt: string;
}

export interface ApplicationAnalyticsData {
  timeRange: TimeRange;
  applications: ApplicationAnalyticsItem[];
}

export interface AiAnalyticsData {
  timeRange: TimeRange;
  totalNotifications: number;
  aiProcessed: number;
  aiSuccess: number;
  aiFallback: number;
  aiProcessingPercentage: number;
  mostCommonCategory: string;
  mostCommonPriority: string;
  categories: Record<string, number>;
  priorities: Record<string, number>;
}

export interface QueueAnalyticsData {
  available: boolean;
  workerStatus: 'ONLINE' | 'OFFLINE' | string;
  engine: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  retryCount: number;
  notice?: string;
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'offline' | string;
  latencyMs?: number;
  mode?: string;
  state?: string;
  concurrency?: number;
  transport?: string;
  model?: string;
}

export interface SystemHealthData {
  status: 'healthy' | 'degraded';
  components: {
    api: ComponentHealth;
    postgresql: ComponentHealth;
    redis: ComponentHealth;
    worker: ComponentHealth;
    websocket: ComponentHealth;
    ai: ComponentHealth;
  };
  timestamp: string;
}

export interface RecentActivityItem {
  id: string;
  type: 'created' | 'delivered' | 'failed' | 'retried' | 'skipped' | 'ai_processed' | 'app_created' | string;
  title: string;
  description: string;
  applicationName: string;
  channel?: string;
  status?: string;
  timestamp: string;
}
