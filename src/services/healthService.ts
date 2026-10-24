import { HealthResponse } from '../types/api';
import { request } from './apiClient';

export interface BackendHealthCheck {
  isOnline: boolean;
  status: 'healthy' | 'degraded' | 'offline';
  api: 'ok' | 'degraded';
  service: string;
  database?: string;
  redis?: string;
  queueEngine?: string;
  worker?: string;
  timestamp?: string;
}

/**
 * Checks backend health status via GET /api/health
 */
export async function checkBackendHealth(): Promise<BackendHealthCheck> {
  try {
    const res = await request<HealthResponse>('/api/health', {
      method: 'GET',
    });

    const isHealthy = res.status === 'healthy' || res.status === 'ok' || res.api === 'ok';

    return {
      isOnline: isHealthy,
      status: isHealthy ? (res.status === 'degraded' ? 'degraded' : 'healthy') : 'offline',
      api: res.api || (isHealthy ? 'ok' : 'degraded'),
      service: res.service || 'NotifyX',
      database: res.database,
      redis: res.redis,
      queueEngine: res.queue?.engine,
      worker: res.worker,
      timestamp: res.timestamp,
    };
  } catch (error) {
    console.warn('Backend health check error:', error);
    return {
      isOnline: false,
      status: 'offline',
      api: 'degraded',
      service: 'NotifyX (Unreachable)',
    };
  }
}
