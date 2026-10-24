export interface HealthResponse {
  status: 'healthy' | 'ok' | 'degraded' | 'error';
  api?: 'ok' | 'degraded';
  service?: string;
  database?: string;
  redis?: string;
  queue?: {
    status: string;
    engine: string;
  };
  worker?: string;
  timestamp?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
