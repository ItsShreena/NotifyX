import { DeliveryChannel } from './application';

export type DeliveryStatus = 'delivered' | 'pending' | 'failed' | 'retrying';

export interface NotificationLog {
  id: string;
  eventId: string;
  eventName: string;
  applicationId: string;
  applicationName: string;
  recipient: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  statusCode: number; // e.g. 200, 201, 429, 500
  attempts: number;
  maxAttempts: number;
  latencyMs: number;
  timestamp: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  responseBody?: string;
  errorMessage?: string;
}
