import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { auditLogService } from '../security/auditLogService.ts';
import type { SecurityEventType } from '../security/auditLogService.ts';

export const securityRouter = Router();

// Protect all security endpoints with developer authentication
securityRouter.use(requireAuth);

/**
 * GET /api/security/overview
 * Returns summary statistics for security activity and policy enforcement.
 */
securityRouter.get('/overview', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const overview = await auditLogService.getSecurityOverview(userId);

    res.json({
      success: true,
      data: overview,
    });
  } catch (err: any) {
    console.error('Failed to retrieve security overview:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve security overview.',
    });
  }
});

/**
 * GET /api/security/audit-logs
 * Retrieves security audit events filtered by application or event type.
 */
securityRouter.get('/audit-logs', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const { applicationId, eventType, limit } = req.query;

    const logs = await auditLogService.getAuditLogs({
      userId,
      applicationId: applicationId as string | undefined,
      eventType: eventType as SecurityEventType | undefined,
      limit: limit ? Number(limit) : 25,
    });

    res.json({
      success: true,
      data: logs,
    });
  } catch (err: any) {
    console.error('Failed to retrieve security audit logs:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve audit logs.',
    });
  }
});
