import type { Request, Response, NextFunction } from 'express';
import { dbService, hashApiKey } from '../services/dbService.ts';
import { auditLogService } from '../security/auditLogService.ts';

export interface ExternalApplicationRequest extends Request {
  application?: {
    id: string;
    userId: string;
    name: string;
    apiKeyPreview: string;
    environment: string;
    status: string;
    apiKeyStatus: string;
    rateLimitPerSec: number;
    webhookUrl?: string | null;
  };
}

/**
 * Middleware for validating external client API keys via Authorization: Bearer <API_KEY>.
 *
 * Security Implementation:
 * 1. Hashes incoming raw API key (e.g. nx_live_...) using SHA-256.
 * 2. Compares hash against indexed apiKeyHash in database (prevents timing attacks and credential leakage).
 * 3. Checks if the key is active (not revoked).
 * 4. Checks if the application is active (not disabled).
 * 5. Updates application's lastActivityAt timestamp.
 * 6. Explicitly rejects query-parameter API keys.
 */
export async function validateApiKey(
  req: ExternalApplicationRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const userAgent = (req.headers['user-agent'] as string) || 'unknown';

  // Explicitly reject API keys in query parameters for security
  if (req.query.apiKey || req.query.api_key || req.query.key) {
    res.status(400).json({
      error: 'QUERY_API_KEY_DISALLOWED',
      message: 'API keys must not be passed via URL query parameters. Use the "Authorization: Bearer <API_KEY>" header.',
    });
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: 'API key required. Provide "Authorization: Bearer <API_KEY>" header.',
      code: 'API_KEY_MISSING',
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      success: false,
      error: 'Malformed Authorization header. Format: "Bearer <API_KEY>".',
      code: 'INVALID_HEADER_FORMAT',
    });
    return;
  }

  const rawApiKey = parts[1].trim();

  // Validate convention format
  if (!rawApiKey.startsWith('nx_live_') && !rawApiKey.startsWith('nx_test_')) {
    auditLogService.logEvent({
      eventType: 'unauthorized_request',
      ipAddress: clientIp,
      userAgent,
      metadata: { reason: 'invalid_key_prefix' },
    }).catch(() => {});

    res.status(401).json({
      success: false,
      error: 'Invalid API key format. Expected prefix "nx_live_..." or "nx_test_...".',
      code: 'INVALID_KEY_PREFIX',
    });
    return;
  }

  try {
    const keyHash = hashApiKey(rawApiKey);
    const app = await dbService.findApplicationByApiKeyHash(keyHash);

    if (!app) {
      auditLogService.logEvent({
        eventType: 'unauthorized_request',
        ipAddress: clientIp,
        userAgent,
        metadata: { reason: 'api_key_not_found' },
      }).catch(() => {});

      res.status(401).json({
        success: false,
        error: 'Invalid API key. Application not found.',
        code: 'INVALID_API_KEY',
      });
      return;
    }

    if (app.apiKeyStatus === 'revoked') {
      auditLogService.logEvent({
        eventType: 'unauthorized_request',
        applicationId: app.id,
        userId: app.userId,
        ipAddress: clientIp,
        userAgent,
        metadata: { reason: 'api_key_revoked' },
      }).catch(() => {});

      res.status(401).json({
        success: false,
        error: 'This API key has been revoked. Please regenerate your credentials in the NotifyX console.',
        code: 'API_KEY_REVOKED',
      });
      return;
    }

    if (app.status === 'disabled') {
      res.status(403).json({
        success: false,
        error: 'This application is currently disabled. Event dispatch is blocked.',
        code: 'APPLICATION_DISABLED',
      });
      return;
    }

    if (app.status === 'paused') {
      res.status(429).json({
        success: false,
        error: 'This application is paused. API ingestion temporarily suspended.',
        code: 'APPLICATION_PAUSED',
      });
      return;
    }

    // Touch lastActivityAt timestamp asynchronously
    dbService.touchApplicationActivity(app.id).catch((err) => {
      console.warn('Failed to update application last activity:', err);
    });

    req.application = app;
    next();
  } catch (err) {
    console.error('API key verification error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal error validating API key.',
      code: 'AUTH_INTERNAL_ERROR',
    });
  }
}
