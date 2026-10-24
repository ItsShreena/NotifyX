import type { Request, Response, NextFunction } from 'express';

/**
 * Applies defense-in-depth security headers to protect against:
 * - Clickjacking (X-Frame-Options)
 * - MIME-sniffing attacks (X-Content-Type-Options)
 * - Cross-site scripting (X-XSS-Protection)
 * - Protocol downgrades (Strict-Transport-Security)
 * - Unintended referrer leakage (Referrer-Policy)
 */
export function applySecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Prevent browser MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Protect against clickjacking in iframes, allowing parent frame in AI Studio preview if needed
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Cross-site scripting filter protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Enforce HTTPS transmission
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Restrict referrer information to the origin
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy for cross-site scripting and injection mitigation
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ws: wss: http: https:; frame-ancestors 'self' https:;"
  );

  // Disable sensitive hardware/browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Disable browser caching for sensitive API responses
  if (_req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  next();
}

/**
 * Secure CORS handler with origin whitelisting.
 * Avoids wildcard (*) on authenticated endpoints.
 */
export function configureCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const configuredFrontend = process.env.FRONTEND_URL;

  // Allowed origin list
  const allowedOrigins = [
    configuredFrontend,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ].filter(Boolean) as string[];

  let isAllowed = !origin || allowedOrigins.includes(origin);

  if (origin && !isAllowed) {
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname;
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.run.app') ||
        host === 'run.app' ||
        host.endsWith('.google.com') ||
        host === 'google.com'
      ) {
        isAllowed = true;
      }
    } catch {
      isAllowed = false;
    }
  }

  if (origin && isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Idempotency-Key, X-Idempotency-Key, Accept'
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, Idempotent-Replay'
    );
  }

  if (req.method === 'OPTIONS') {
    if (!isAllowed) {
      res.status(403).json({ error: 'CORS_ORIGIN_DENIED', message: 'Origin not allowed by CORS policy' });
      return;
    }
    res.sendStatus(204);
    return;
  }

  next();
}
