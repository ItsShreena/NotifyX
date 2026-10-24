import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtAuthPayload, PublicDeveloperProfile } from '../types/auth.ts';
import { userStore } from '../db/userStore.ts';

export const JWT_SECRET = process.env.JWT_SECRET || 'notifyx-dev-secret-replace-in-production-2026';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('⚠️ [SECURITY WARNING]: Running in production without an explicitly defined JWT_SECRET environment variable.');
}

// Extend Express Request to hold authenticated developer
export interface AuthenticatedRequest extends Request {
  developer?: PublicDeveloperProfile;
}

/**
 * Authentication middleware that verifies JWT bearer tokens
 * Protects endpoints and attaches developer profile to req.developer
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: 'Authentication required. Authorization header missing.',
      code: 'AUTH_HEADER_MISSING',
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      success: false,
      error: 'Invalid authorization format. Format must be "Bearer <token>".',
      code: 'INVALID_TOKEN_FORMAT',
    });
    return;
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtAuthPayload;

    const user = await userStore.findById(decoded.sub);
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authenticated developer account no longer exists.',
        code: 'ACCOUNT_NOT_FOUND',
      });
      return;
    }

    // Attach sanitized public developer profile (never passwordHash)
    req.developer = userStore.toPublicProfile(user);
    next();
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Authentication token has expired. Please sign in again.',
        code: 'TOKEN_EXPIRED',
      });
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid or forged authentication token.',
        code: 'INVALID_TOKEN',
      });
      return;
    }

    res.status(401).json({
      success: false,
      error: 'Authentication verification failed.',
      code: 'AUTH_FAILED',
    });
    return;
  }
}
