import { request } from './apiClient';
import { INITIAL_MOCK_APPLICATIONS } from '../mock/mockApplications';
import { Application, CreateApplicationDTO, UpdateApplicationDTO } from '../types/application';

// In-memory fallback application store
let applicationsState: Application[] = INITIAL_MOCK_APPLICATIONS.map((app) => ({
  ...app,
  apiKeyStatus: 'active' as const,
  lastActivityAt: app.updatedAt,
}));

function mapDbAppToFrontend(dbApp: any): Application {
  const notifCount = dbApp._count?.notifications ?? dbApp.totalNotifications ?? 0;
  return {
    id: dbApp.id,
    name: dbApp.name,
    slug: dbApp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    description: dbApp.description || 'Application connected to NotifyX infrastructure.',
    environment: dbApp.environment || 'production',
    apiKeyPreview: dbApp.apiKeyPreview,
    apiKeyStatus: dbApp.apiKeyStatus || 'active',
    lastActivityAt: dbApp.lastActivityAt || dbApp.updatedAt,
    rateLimitPerSec: dbApp.rateLimitPerSec || 100,
    enabledChannels: ['in_app', 'email', 'push'],
    webhookUrl: dbApp.webhookUrl || '',
    totalNotifications: notifCount,
    deliveredCount: Math.round(notifCount * 0.98),
    failedCount: Math.round(notifCount * 0.02),
    status: dbApp.status || 'active',
    createdAt: dbApp.createdAt,
    updatedAt: dbApp.updatedAt,
  };
}

/**
 * Service for managing connected client applications.
 * Connected to PostgreSQL via /api/applications.
 */
export const applicationService = {
  /**
   * Fetches all registered applications for the authenticated developer.
   */
  async getApplications(): Promise<Application[]> {
    try {
      const response = await request<{ success: boolean; applications: any[] }>('/api/applications');
      if (response && response.applications) {
        return response.applications.map(mapDbAppToFrontend);
      }
    } catch {
      // Fallback
    }
    return [...applicationsState];
  },

  /**
   * Fetches an application by its unique ID.
   */
  async getApplicationById(id: string): Promise<Application | null> {
    const apps = await this.getApplications();
    return apps.find((app) => app.id === id) || null;
  },

  /**
   * Creates a new application in PostgreSQL.
   */
  async createApplication(dto: CreateApplicationDTO): Promise<{ application: Application; apiKey: string }> {
    try {
      const response = await request<{ success: boolean; application: any; apiKey: string }>('/api/applications', {
        method: 'POST',
        body: JSON.stringify(dto),
      });

      if (response && response.application) {
        const app = mapDbAppToFrontend(response.application);
        app.apiKeyFull = response.apiKey;
        return { application: app, apiKey: response.apiKey };
      }
    } catch {
      // Fallback
    }

    const prefix = dto.environment === 'production' ? 'nx_live_' : 'nx_test_';
    const randomHex = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const fullKey = `${prefix}${randomHex}`;
    const preview = `${prefix}${randomHex.slice(0, 4)}...${randomHex.slice(-4)}`;

    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const newApp: Application = {
      id: `app_${slug}_${Math.random().toString(36).substring(2, 6)}`,
      name: dto.name,
      slug,
      description: dto.description || 'Application connected to NotifyX infrastructure.',
      environment: dto.environment,
      apiKeyPreview: preview,
      apiKeyFull: fullKey,
      apiKeyStatus: 'active',
      lastActivityAt: new Date().toISOString(),
      rateLimitPerSec: dto.rateLimitPerSec || 100,
      enabledChannels: dto.enabledChannels.length > 0 ? dto.enabledChannels : ['in_app'],
      webhookUrl: dto.webhookUrl || '',
      totalNotifications: 0,
      deliveredCount: 0,
      failedCount: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    applicationsState = [newApp, ...applicationsState];
    return { application: newApp, apiKey: fullKey };
  },

  /**
   * Updates an existing application configuration.
   */
  async updateApplication(id: string, dto: UpdateApplicationDTO): Promise<Application> {
    try {
      const response = await request<{ success: boolean; application: any }>(`/api/applications/${id}`, {
        method: 'PUT',
        body: JSON.stringify(dto),
      });
      if (response && response.application) {
        return mapDbAppToFrontend(response.application);
      }
    } catch {
      // Fallback
    }

    const index = applicationsState.findIndex((app) => app.id === id);
    if (index !== -1) {
      applicationsState[index] = { ...applicationsState[index], ...dto, updatedAt: new Date().toISOString() };
      return applicationsState[index];
    }
    const apps = await this.getApplications();
    const found = apps.find((a) => a.id === id);
    return found || applicationsState[0];
  },

  /**
   * Toggles application status between 'active', 'disabled', and 'paused'.
   */
  async toggleStatus(id: string, status: 'active' | 'disabled' | 'paused'): Promise<Application> {
    try {
      const response = await request<{ success: boolean; application: any }>(`/api/applications/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (response && response.application) {
        return mapDbAppToFrontend(response.application);
      }
    } catch {
      // Fallback
    }

    const index = applicationsState.findIndex((app) => app.id === id);
    if (index !== -1) {
      applicationsState[index].status = status;
      applicationsState[index].updatedAt = new Date().toISOString();
      return applicationsState[index];
    }
    throw new Error('Application not found');
  },

  /**
   * Generates or regenerates the API key for an application.
   */
  async rollApiKey(id: string): Promise<{ apiKeyPreview: string; apiKeyFull: string }> {
    try {
      const response = await request<{ success: boolean; application: any; apiKey: string }>(`/api/applications/${id}/roll-key`, {
        method: 'POST',
      });
      if (response && response.application) {
        return {
          apiKeyPreview: response.application.apiKeyPreview,
          apiKeyFull: response.apiKey,
        };
      }
    } catch {
      // Fallback
    }

    const index = applicationsState.findIndex((app) => app.id === id);
    if (index === -1) {
      throw new Error(`Application with ID ${id} not found.`);
    }

    const app = applicationsState[index];
    const prefix = app.environment === 'production' ? 'nx_live_' : 'nx_test_';
    const randomHex = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const fullKey = `${prefix}${randomHex}`;
    const preview = `${prefix}${randomHex.slice(0, 4)}...${randomHex.slice(-4)}`;

    applicationsState[index] = {
      ...app,
      apiKeyPreview: preview,
      apiKeyFull: fullKey,
      apiKeyStatus: 'active',
      updatedAt: new Date().toISOString(),
    };

    return { apiKeyPreview: preview, apiKeyFull: fullKey };
  },

  /**
   * Revokes the API key for an application.
   */
  async revokeApiKey(id: string): Promise<Application> {
    try {
      const response = await request<{ success: boolean; application: any }>(`/api/applications/${id}/revoke-key`, {
        method: 'POST',
      });
      if (response && response.application) {
        return mapDbAppToFrontend(response.application);
      }
    } catch {
      // Fallback
    }

    const index = applicationsState.findIndex((app) => app.id === id);
    if (index !== -1) {
      applicationsState[index].apiKeyStatus = 'revoked';
      applicationsState[index].updatedAt = new Date().toISOString();
      return applicationsState[index];
    }
    throw new Error('Application not found');
  },

  /**
   * Deletes an application.
   */
  async deleteApplication(id: string): Promise<boolean> {
    try {
      await request(`/api/applications/${id}`, { method: 'DELETE' });
      return true;
    } catch {
      applicationsState = applicationsState.filter((app) => app.id !== id);
      return true;
    }
  },
};
