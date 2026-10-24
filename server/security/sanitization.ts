import type { Request, Response, NextFunction } from 'express';

const SENSITIVE_KEY_PATTERNS = [
  'password',
  'token',
  'jwt',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'database_url',
  'redis_url',
];

/**
 * Recursively deep-sanitizes an object by masking any keys that match sensitive patterns.
 */
export function sanitizeObject<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item)) as unknown as T;
  }

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => lowerKey.includes(pattern));

    if (isSensitive) {
      clean[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      clean[key] = sanitizeObject(value);
    } else {
      clean[key] = value;
    }
  }

  return clean as T;
}

/**
 * Sanitizes headers for safe logging without exposing bearer tokens or API keys.
 */
export function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...headers };
  delete clean['authorization'];
  delete clean['cookie'];
  delete clean['x-api-key'];
  return clean;
}

/**
 * Express error handling middleware that masks internal error details, stack traces,
 * database connection strings, and server file paths from clients.
 */
export function secureErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log full error securely server-side for operational diagnosis
  console.error('🔒 [Internal Server Error Caught]:', {
    message: err.message,
    name: err.name,
    code: err.code,
  });

  // Client response guarantees ZERO sensitive information leakage
  res.status(err.status || err.statusCode || 500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected internal error occurred. Please contact NotifyX support.',
  });
}
