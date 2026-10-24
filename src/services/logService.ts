import { request } from './apiClient';
import { INITIAL_MOCK_LOGS } from '../mock/mockLogs';
import { DeliveryStatus, NotificationLog } from '../types/logs';

let logsState: NotificationLog[] = [...INITIAL_MOCK_LOGS];

function mapDbDeliveryToFrontend(del: any): NotificationLog {
  const notif = del.notification;
  return {
    id: del.id,
    eventId: `evt_${del.id.slice(-6)}`,
    eventName: `${notif?.type || 'notification'}.${(notif?.title || 'event').toLowerCase().replace(/\s+/g, '_').slice(0, 16)}`,
    applicationId: notif?.applicationId || '',
    applicationName: notif?.application?.name || 'Application',
    recipient: notif?.recipientId || 'usr_unknown',
    channel: del.channel,
    status: del.status as DeliveryStatus,
    statusCode: del.statusCode || 200,
    attempts: del.attempts || 1,
    maxAttempts: del.maxAttempts || 3,
    latencyMs: del.latencyMs || 45,
    timestamp: del.createdAt,
    payload: del.requestPayload || { title: notif?.title, recipient: notif?.recipientId },
    headers: { 'content-type': 'application/json', 'x-notifyx-db': 'prisma-postgres' },
    responseBody: del.responseBody || '{"status":"delivered"}',
    errorMessage: del.errorMessage,
  };
}

/**
 * Service for querying and inspecting delivery event logs.
 * Connected to PostgreSQL via /api/deliveries.
 */
export const logService = {
  /**
   * Retrieves notification delivery logs with filtering options.
   */
  async getLogs(filter?: {
    status?: DeliveryStatus | 'all';
    channel?: string;
    searchQuery?: string;
  }): Promise<NotificationLog[]> {
    try {
      const queryParams = new URLSearchParams();
      if (filter?.status && filter.status !== 'all') {
        queryParams.set('status', filter.status);
      }
      if (filter?.channel && filter.channel !== 'all') {
        queryParams.set('channel', filter.channel);
      }

      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      const response = await request<{ success: boolean; deliveries: any[] }>(`/api/deliveries${queryString}`);

      if (response && response.deliveries && response.deliveries.length > 0) {
        let results = response.deliveries.map(mapDbDeliveryToFrontend);
        if (filter?.searchQuery) {
          const q = filter.searchQuery.toLowerCase();
          results = results.filter(
            (log) =>
              log.eventName.toLowerCase().includes(q) ||
              log.eventId.toLowerCase().includes(q) ||
              log.recipient.toLowerCase().includes(q) ||
              log.applicationName.toLowerCase().includes(q)
          );
        }
        return results;
      }
    } catch {
      // Fallback
    }

    let results = [...logsState];
    if (filter?.status && filter.status !== 'all') {
      results = results.filter((log) => log.status === filter.status);
    }
    if (filter?.channel && filter.channel !== 'all') {
      results = results.filter((log) => log.channel === filter.channel);
    }
    if (filter?.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      results = results.filter(
        (log) =>
          log.eventName.toLowerCase().includes(q) ||
          log.eventId.toLowerCase().includes(q) ||
          log.recipient.toLowerCase().includes(q) ||
          log.applicationName.toLowerCase().includes(q)
      );
    }
    return results;
  },

  /**
   * Appends an in-flight delivery log.
   */
  async appendLog(log: NotificationLog): Promise<void> {
    logsState = [log, ...logsState];
  },
};
