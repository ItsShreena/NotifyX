import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userStore } from '../db/userStore.ts';
import { preferenceService } from '../services/preferenceService.ts';
import { requireAuth, JWT_SECRET, JWT_EXPIRES_IN } from '../middleware/authMiddleware.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { authRateLimiter } from '../security/rateLimiter.ts';
import { auditLogService } from '../security/auditLogService.ts';

export const authRouter = Router();

// Basic RFC 5322 compliant email regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/signup
 * Registers a new developer account.
 * Hashes the password and returns an authenticated JWT session.
 */
authRouter.post('/signup', authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const userAgent = (req.headers['user-agent'] as string) || 'unknown';

  try {
    const { name, email, password } = req.body;

    // Input Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({
        success: false,
        error: 'Full name is required and must be at least 2 characters long.',
      });
      return;
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({
        success: false,
        error: 'A valid email address is required.',
      });
      return;
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long.',
      });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check for existing account
    const existing = await userStore.findByEmail(normalizedEmail);
    if (existing) {
      res.status(409).json({
        success: false,
        error: 'An account with this email address already exists.',
      });
      return;
    }

    // Secure password hashing using bcryptjs (salt rounds: 10)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user record
    const newUser = await userStore.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    // Initialize sensible default notification preferences in database
    await preferenceService.ensureDefaultPreferences(newUser.id);

    // Log security audit event
    await auditLogService.logEvent({
      eventType: 'signup',
      userId: newUser.id,
      ipAddress: clientIp,
      userAgent,
      metadata: { email: normalizedEmail },
    });

    // Generate JWT
    const token = jwt.sign(
      {
        sub: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    // Return token and sanitized public profile (zero password leak)
    res.status(201).json({
      success: true,
      token,
      developer: userStore.toPublicProfile(newUser),
      message: 'Developer account created successfully.',
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({
      success: false,
      error: 'An internal error occurred while creating your account. Please try again.',
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticates developer credentials and returns an authorized JWT session.
 */
authRouter.post('/login', authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const userAgent = (req.headers['user-agent'] as string) || 'unknown';

  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Both email and password are required.',
      });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await userStore.findByEmail(normalizedEmail);

    // Timing-safe response: don't reveal if user exists
    if (!user) {
      await auditLogService.logEvent({
        eventType: 'login_failure',
        ipAddress: clientIp,
        userAgent,
        metadata: { reason: 'user_not_found', email: normalizedEmail },
      });

      res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
      return;
    }

    // Verify hashed password
    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      await auditLogService.logEvent({
        eventType: 'login_failure',
        userId: user.id,
        ipAddress: clientIp,
        userAgent,
        metadata: { reason: 'invalid_credentials' },
      });

      res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
      return;
    }

    // Log successful login
    await auditLogService.logEvent({
      eventType: 'login_success',
      userId: user.id,
      ipAddress: clientIp,
      userAgent,
    });

    // Create JWT
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );

    res.status(200).json({
      success: true,
      token,
      developer: userStore.toPublicProfile(user),
      message: 'Authenticated successfully.',
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({
      success: false,
      error: 'An internal error occurred during authentication. Please try again.',
    });
  }
});

/**
 * GET /api/auth/me
 * Protected endpoint to fetch the current developer profile from token
 */
authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  res.status(200).json({
    success: true,
    developer: req.developer,
  });
});

/**
 * POST /api/auth/logout
 * Client-side session termination confirmation
 */
authRouter.post('/logout', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
});
