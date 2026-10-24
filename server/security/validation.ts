import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// Supported priorities
export const PrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

// Notification Dispatch Schema
export const CreateNotificationSchema = z.object({
  recipientId: z
    .string()
    .trim()
    .min(1, 'recipientId cannot be empty')
    .max(255, 'recipientId must not exceed 255 characters'),
  type: z
    .string()
    .trim()
    .min(1, 'type cannot be empty')
    .max(64, 'type must not exceed 64 characters'),
  title: z
    .string()
    .trim()
    .min(1, 'title cannot be empty')
    .max(200, 'Notification title: maximum 200 characters'),
  message: z
    .string()
    .trim()
    .min(1, 'message cannot be empty')
    .max(5000, 'Notification message: maximum 5000 characters'),
  priority: PrioritySchema.optional().default('normal'),
  channel: z
    .enum(['in_app', 'email', 'push', 'sms', 'webhook', 'multi', 'all', 'multi_channel'])
    .optional()
    .default('in_app'),
  actionUrl: z
    .string()
    .trim()
    .max(2048, 'actionUrl must not exceed 2048 characters')
    .optional()
    .nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  idempotencyKey: z
    .string()
    .trim()
    .min(1, 'idempotencyKey cannot be empty')
    .max(128, 'idempotencyKey must not exceed 128 characters')
    .regex(/^[a-zA-Z0-9_\-.:]+$/, 'idempotencyKey contains invalid characters')
    .optional(),
});

// Authentication Sign-Up Schema
export const SignupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name must not exceed 100 characters'),
  email: z
    .string()
    .trim()
    .email('Please provide a valid email address')
    .max(255, 'Email must not exceed 255 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password must not exceed 128 characters'),
});

// Authentication Login Schema
export const LoginSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Please provide a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
});

// Application Creation Schema
export const CreateApplicationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Application name must be at least 2 characters')
    .max(64, 'Application name must not exceed 64 characters'),
  description: z.string().trim().max(500, 'Description must not exceed 500 characters').optional(),
  environment: z.enum(['production', 'staging', 'development']).optional().default('production'),
  rateLimitPerSec: z.number().int().min(1).max(5000).optional().default(100),
  webhookUrl: z.string().trim().max(1024).url('Invalid webhook URL format').optional().nullable(),
});

/**
 * Higher-order middleware generator that validates request body against a Zod schema.
 * Formats errors cleanly matching Section 10 specification.
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || 'body';
        fieldErrors[path] = issue.message;
      }

      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request payload.',
        fields: fieldErrors,
      });
      return;
    }

    req.body = result.data;
    next();
  };
}
