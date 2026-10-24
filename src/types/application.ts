export type Environment = 'production' | 'staging' | 'development';

export type DeliveryChannel = 'in_app' | 'email' | 'webhook' | 'sms' | 'push';

export interface Application {
  id: string;
  name: string;
  slug: string;
  description: string;
  environment: Environment;
  apiKeyPreview: string; // e.g. "nx_live_98a...3f1a"
  apiKeyFull?: string;
  apiKeyStatus: 'active' | 'revoked';
  lastActivityAt?: string;
  rateLimitPerSec: number;
  enabledChannels: DeliveryChannel[];
  webhookUrl?: string;
  totalNotifications: number;
  deliveredCount: number;
  failedCount: number;
  status: 'active' | 'disabled' | 'paused' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface CreateApplicationDTO {
  name: string;
  description: string;
  environment: Environment;
  rateLimitPerSec: number;
  enabledChannels: DeliveryChannel[];
  webhookUrl?: string;
}

export interface UpdateApplicationDTO {
  name?: string;
  description?: string;
  environment?: Environment;
  rateLimitPerSec?: number;
  enabledChannels?: DeliveryChannel[];
  webhookUrl?: string;
  status?: 'active' | 'disabled' | 'paused' | 'archived';
}
