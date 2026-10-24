import { request } from './apiClient';

export interface SecurityOverviewData {
  totalEvents: number;
  loginFailures: number;
  rateLimitEvents: number;
  apiKeyEvents: number;
  unauthorizedRequests: number;
  recentLogs: Array<{
    id: string;
    eventType: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export const securityService = {
  /**
   * Fetches security overview metrics and recent audit log events.
   */
  async getOverview(): Promise<SecurityOverviewData> {
    try {
      const res = await request<{ success: boolean; data: SecurityOverviewData }>('/api/security/overview');
      return res.data;
    } catch {
      return {
        totalEvents: 0,
        loginFailures: 0,
        rateLimitEvents: 0,
        apiKeyEvents: 0,
        unauthorizedRequests: 0,
        recentLogs: [],
      };
    }
  },

  /**
   * Fetches detailed audit logs.
   */
  async getAuditLogs(limit = 25): Promise<any[]> {
    try {
      const res = await request<{ success: boolean; data: any[] }>(`/api/security/audit-logs?limit=${limit}`);
      return res.data;
    } catch {
      return [];
    }
  },
};
