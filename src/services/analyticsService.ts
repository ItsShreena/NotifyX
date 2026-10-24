import { request } from './apiClient';
import {
  TimeRange,
  AnalyticsOverview,
  NotificationTimelineData,
  DeliveryAnalyticsData,
  DeliveryLatencyData,
  RetryAnalyticsData,
  FailureAnalyticsData,
  ChannelAnalyticsData,
  ApplicationAnalyticsData,
  AiAnalyticsData,
  QueueAnalyticsData,
  SystemHealthData,
  RecentActivityItem,
} from '../types/analytics';
import { DashboardStats, ActivityDataPoint } from '../types/stats';

/**
 * Service for communicating with NotifyX Analytics & Monitoring API (/api/analytics/*).
 * All calculations and metric aggregations are performed by the backend AnalyticsService.
 */
export const analyticsService = {
  /**
   * High-level overview: total notifications, delivered, failed, pending, skipped, success rate, latency, retries.
   */
  async getOverview(range: TimeRange = '7d'): Promise<AnalyticsOverview> {
    const res = await request<{ success: boolean; data: AnalyticsOverview }>(
      `/api/analytics/overview?range=${range}`
    );
    return res.data;
  },

  /**
   * Chronological notification volume timeline in discrete time buckets.
   */
  async getTimeline(range: TimeRange = '7d'): Promise<NotificationTimelineData> {
    const res = await request<{ success: boolean; data: NotificationTimelineData }>(
      `/api/analytics/timeline?range=${range}`
    );
    return res.data;
  },

  /**
   * Delivery performance, latency metrics, retries, and grouped failure reasons.
   */
  async getDelivery(range: TimeRange = '7d'): Promise<{
    delivery: DeliveryAnalyticsData;
    latency: DeliveryLatencyData;
    retries: RetryAnalyticsData;
    failures: FailureAnalyticsData;
  }> {
    const res = await request<{
      success: boolean;
      data: {
        delivery: DeliveryAnalyticsData;
        latency: DeliveryLatencyData;
        retries: RetryAnalyticsData;
        failures: FailureAnalyticsData;
      };
    }>(`/api/analytics/delivery?range=${range}`);
    return res.data;
  },

  /**
   * Breakdown and comparison across In-App, Email, and Push channels.
   */
  async getChannels(range: TimeRange = '7d'): Promise<ChannelAnalyticsData> {
    const res = await request<{ success: boolean; data: ChannelAnalyticsData }>(
      `/api/analytics/channels?range=${range}`
    );
    return res.data;
  },

  /**
   * Multi-application usage and success metrics.
   */
  async getApplications(range: TimeRange = '7d'): Promise<ApplicationAnalyticsData> {
    const res = await request<{ success: boolean; data: ApplicationAnalyticsData }>(
      `/api/analytics/applications?range=${range}`
    );
    return res.data;
  },

  /**
   * AI Notification Intelligence performance and category distribution.
   */
  async getAI(range: TimeRange = '7d'): Promise<AiAnalyticsData> {
    const res = await request<{ success: boolean; data: AiAnalyticsData }>(
      `/api/analytics/ai?range=${range}`
    );
    return res.data;
  },

  /**
   * Queue & Worker health (BullMQ, Redis, or embedded engine).
   */
  async getQueue(): Promise<QueueAnalyticsData> {
    const res = await request<{ success: boolean; data: QueueAnalyticsData }>('/api/analytics/queue');
    return res.data;
  },

  /**
   * System health status across core components (API, DB, Redis, Worker, WebSocket, AI).
   */
  async getHealth(): Promise<SystemHealthData> {
    const res = await request<{ success: boolean; data: SystemHealthData }>('/api/analytics/health');
    return res.data;
  },

  /**
   * Chronological activity stream of recent events.
   */
  async getActivity(limit: number = 20): Promise<RecentActivityItem[]> {
    const res = await request<{ success: boolean; data: RecentActivityItem[] }>(
      `/api/analytics/activity?limit=${limit}`
    );
    return res.data;
  },

  /**
   * DashboardStats adapter for existing DashboardPage, computing real values from backend overview.
   */
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const [overview, timeline, channels, apps] = await Promise.all([
        this.getOverview('7d'),
        this.getTimeline('24h'),
        this.getChannels('7d'),
        this.getApplications('7d'),
      ]);

      // Aggregate 24-hour timeline into discrete 2-hour intervals (12 intervals across 24h)
      const rawBuckets = timeline.timeline || [];
      const deliveryActivity: ActivityDataPoint[] = [];

      if (rawBuckets.length >= 24) {
        for (let i = 0; i < rawBuckets.length; i += 2) {
          const b1 = rawBuckets[i];
          const b2 = rawBuckets[i + 1] || b1;
          const delivered = b1.delivered + b2.delivered;
          const failed = b1.failed + b2.failed;
          const created = b1.created + b2.created;
          const pending = Math.max(0, created - delivered - failed);
          deliveryActivity.push({
            time: b2.label,
            interval: `${b1.label} – ${b2.label}`,
            delivered,
            failed,
            pending,
            total: created,
          });
        }
      } else {
        rawBuckets.forEach((pt) => {
          deliveryActivity.push({
            time: pt.label,
            interval: pt.label,
            delivered: pt.delivered,
            failed: pt.failed,
            pending: Math.max(0, pt.created - pt.delivered - pt.failed),
            total: pt.created,
          });
        });
      }

      const totalDeliveries = channels.channels.reduce((acc, c) => acc + c.total, 0) || 1;
      const channelBreakdown = channels.channels.map((c) => ({
        channel: c.channel as any,
        label: c.label,
        count: c.delivered,
        percentage: Number(((c.delivered / totalDeliveries) * 100).toFixed(1)),
      }));

      return {
        totalNotifications: overview.totalNotifications,
        delivered: overview.delivered,
        failed: overview.failed,
        pending: overview.pending,
        readRate: overview.successRate,
        activeApplicationsCount: apps.applications.filter((a) => a.status === 'active').length,
        deliveryActivity,
        channelBreakdown,
      };
    } catch {
      // Fallback in case of temporary network disruption
      return {
        totalNotifications: 0,
        delivered: 0,
        failed: 0,
        pending: 0,
        readRate: 100.0,
        activeApplicationsCount: 0,
        deliveryActivity: [],
        channelBreakdown: [],
      };
    }
  },
};
