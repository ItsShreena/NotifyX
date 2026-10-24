import { request } from './apiClient';

export interface QueueMetricsData {
  pending: number;
  processing: number;
  delivered: number;
  failed: number;
  retryCount: number;
  delayed: number;
}

export interface RedisHealthData {
  connected: boolean;
  latencyMs: number;
  host: string;
  port: number;
  error?: string;
}

export interface QueueJobItem {
  id: string;
  name: string;
  data: {
    notificationId: string;
    recipientId: string;
    channel: string;
  };
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  attemptsMade: number;
  maxAttempts: number;
  failedReason?: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  durationMs?: number;
}

export const queueService = {
  async getMetrics(): Promise<{ metrics: QueueMetricsData; redis: RedisHealthData }> {
    const response = await request<{
      success: boolean;
      metrics: QueueMetricsData;
      redis: RedisHealthData;
    }>('/api/queue/metrics');

    return {
      metrics: response.metrics,
      redis: response.redis,
    };
  },

  async getJobs(limit: number = 15): Promise<QueueJobItem[]> {
    const response = await request<{
      success: boolean;
      jobs: QueueJobItem[];
      count: number;
    }>(`/api/queue/jobs?limit=${limit}`);

    return response.jobs || [];
  },

  async retryFailedJobs(): Promise<{ retriedCount: number }> {
    const response = await request<{
      success: boolean;
      retriedCount: number;
    }>('/api/queue/retry-failed', {
      method: 'POST',
    });

    return { retriedCount: response.retriedCount };
  },

  async getDeadLetterNotifications(): Promise<any[]> {
    const response = await request<{
      success: boolean;
      failedNotifications: any[];
      count: number;
    }>('/api/queue/dead-letter');

    return response.failedNotifications || [];
  },

  async retryJob(jobId: string): Promise<boolean> {
    const response = await request<{
      success: boolean;
      message: string;
    }>(`/api/queue/retry-job/${jobId}`, {
      method: 'POST',
    });

    return response.success;
  },
};
