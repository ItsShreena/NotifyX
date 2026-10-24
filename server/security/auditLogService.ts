import { prisma, isDatabaseConnected } from '../db/prisma.ts';

export type SecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'signup'
  | 'api_key_created'
  | 'api_key_revoked'
  | 'api_key_regenerated'
  | 'application_created'
  | 'application_deleted'
  | 'rate_limit_exceeded'
  | 'unauthorized_request'
  | 'permission_failure';

export interface AuditLogEntry {
  id?: string;
  userId?: string | null;
  applicationId?: string | null;
  eventType: SecurityEventType;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
}

// Memory fallback store for audit logs
const memoryAuditLogs: AuditLogEntry[] = [];

/**
 * Strips sensitive keys (passwords, tokens, keys, secrets) from metadata before persisting.
 */
function sanitizeMetadata(metadata?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!metadata) return null;
  const sanitized: Record<string, unknown> = {};
  const forbiddenPatterns = ['password', 'secret', 'token', 'jwt', 'apikey', 'key', 'credential', 'auth'];

  for (const [k, v] of Object.entries(metadata)) {
    const lowerKey = k.toLowerCase();
    const isForbidden = forbiddenPatterns.some((pattern) => lowerKey.includes(pattern));
    if (isForbidden) {
      sanitized[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 500) {
      sanitized[k] = v.substring(0, 500) + '...[truncated]';
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

export class AuditLogService {
  /**
   * Records a security event. Never stores raw secrets or sensitive data.
   */
  async logEvent(entry: AuditLogEntry): Promise<AuditLogEntry> {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const createdAt = new Date();
    const cleanMeta = sanitizeMetadata(entry.metadata);

    const record: AuditLogEntry = {
      id,
      userId: entry.userId || null,
      applicationId: entry.applicationId || null,
      eventType: entry.eventType,
      ipAddress: entry.ipAddress ? entry.ipAddress.split(',')[0].trim() : null,
      userAgent: entry.userAgent ? entry.userAgent.substring(0, 255) : null,
      metadata: cleanMeta,
      createdAt,
    };

    // Store in PostgreSQL if connected
    if (await isDatabaseConnected()) {
      try {
        await (prisma as any).auditLog.create({
          data: {
            id,
            userId: record.userId,
            applicationId: record.applicationId,
            eventType: record.eventType,
            ipAddress: record.ipAddress,
            userAgent: record.userAgent,
            metadata: cleanMeta ? (cleanMeta as any) : undefined,
            createdAt,
          },
        });
        return record;
      } catch (err) {
        console.warn('AuditLog database write failed, falling back to in-memory store:', err);
      }
    }

    memoryAuditLogs.unshift(record);
    if (memoryAuditLogs.length > 500) {
      memoryAuditLogs.pop();
    }
    return record;
  }

  /**
   * Retrieves security audit events for a developer or application.
   */
  async getAuditLogs(params: {
    userId?: string;
    applicationId?: string;
    eventType?: SecurityEventType;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    const limit = Math.min(100, Math.max(1, params.limit || 20));

    if (await isDatabaseConnected()) {
      try {
        const where: Record<string, any> = {};
        if (params.userId) where.userId = params.userId;
        if (params.applicationId) where.applicationId = params.applicationId;
        if (params.eventType) where.eventType = params.eventType;

        const rows = await (prisma as any).auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        return rows.map((r: any) => ({
          id: r.id,
          userId: r.userId,
          applicationId: r.applicationId,
          eventType: r.eventType as SecurityEventType,
          ipAddress: r.ipAddress,
          userAgent: r.userAgent,
          metadata: (r.metadata as Record<string, unknown>) || null,
          createdAt: r.createdAt,
        }));
      } catch {
        // Fallback to memory
      }
    }

    return memoryAuditLogs
      .filter((entry) => {
        if (params.userId && entry.userId && entry.userId !== params.userId) return false;
        if (params.applicationId && entry.applicationId !== params.applicationId) return false;
        if (params.eventType && entry.eventType !== params.eventType) return false;
        return true;
      })
      .slice(0, limit);
  }

  /**
   * Aggregates overview statistics for the Security Dashboard.
   */
  async getSecurityOverview(userId: string) {
    const logs = await this.getAuditLogs({ userId, limit: 100 });

    let loginFailures = 0;
    let rateLimitEvents = 0;
    let apiKeyEvents = 0;
    let unauthorizedRequests = 0;

    for (const log of logs) {
      if (log.eventType === 'login_failure') loginFailures++;
      else if (log.eventType === 'rate_limit_exceeded') rateLimitEvents++;
      else if (
        log.eventType === 'api_key_created' ||
        log.eventType === 'api_key_revoked' ||
        log.eventType === 'api_key_regenerated'
      ) {
        apiKeyEvents++;
      } else if (log.eventType === 'unauthorized_request' || log.eventType === 'permission_failure') {
        unauthorizedRequests++;
      }
    }

    return {
      totalEvents: logs.length,
      loginFailures,
      rateLimitEvents,
      apiKeyEvents,
      unauthorizedRequests,
      recentLogs: logs.slice(0, 10),
    };
  }
}

export const auditLogService = new AuditLogService();
