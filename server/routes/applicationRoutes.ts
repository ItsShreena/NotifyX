import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { dbService } from '../services/dbService.ts';
import { auditLogService } from '../security/auditLogService.ts';

export const applicationRouter = Router();

// Developer authentication protects all application management endpoints
applicationRouter.use(requireAuth);

/**
 * GET /api/applications
 * Returns all applications owned by the authenticated developer
 */
applicationRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const apps = await dbService.getApplicationsByUserId(userId);
    res.json({
      success: true,
      applications: apps,
    });
  } catch (err) {
    console.error('Failed to fetch applications:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve applications.',
    });
  }
});

/**
 * GET /api/applications/:id
 * Fetches single application owned by authenticated developer
 */
applicationRouter.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const app = await dbService.getApplicationById(req.params.id, userId);

    if (!app) {
      res.status(404).json({
        success: false,
        error: 'Application not found or unauthorized.',
      });
      return;
    }

    res.json({
      success: true,
      application: app,
    });
  } catch (err) {
    console.error('Failed to fetch application:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve application.',
    });
  }
});

/**
 * POST /api/applications
 * Creates a new application.
 * Returns raw API key ONCE to caller; database saves only apiKeyHash.
 */
applicationRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const { name, description, environment, rateLimitPerSec, webhookUrl } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({
        success: false,
        error: 'Application name is required (minimum 2 characters).',
      });
      return;
    }

    const result = await dbService.createApplication({
      userId,
      name,
      description,
      environment,
      rateLimitPerSec: Number(rateLimitPerSec) || 100,
      webhookUrl,
    });

    await auditLogService.logEvent({
      eventType: 'application_created',
      userId,
      applicationId: result.application.id,
      metadata: { name: result.application.name, environment: result.application.environment },
    });

    res.status(201).json({
      success: true,
      application: result.application,
      apiKey: result.rawApiKey, // One-time credential disclosure
      message: 'Application created successfully. Store your API key in a secure location.',
    });
  } catch (err: unknown) {
    console.error('Failed to create application:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to create application. Check if an application with this name already exists.',
    });
  }
});

/**
 * PUT /api/applications/:id
 * Edits application settings (respecting developer ownership)
 */
applicationRouter.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const applicationId = req.params.id;
    const { name, description, environment, rateLimitPerSec, webhookUrl, status } = req.body;

    const updated = await dbService.updateApplication(applicationId, userId, {
      name,
      description,
      environment,
      rateLimitPerSec,
      webhookUrl,
      status,
    });

    res.json({
      success: true,
      application: updated,
      message: 'Application updated successfully.',
    });
  } catch (err) {
    console.error('Failed to update application:', err);
    res.status(404).json({
      success: false,
      error: 'Application not found or unauthorized to edit.',
    });
  }
});

/**
 * PATCH /api/applications/:id/status
 * Enables or disables application traffic
 */
applicationRouter.patch('/:id/status', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const applicationId = req.params.id;
    const { status } = req.body;

    if (!['active', 'disabled', 'paused'].includes(status)) {
      res.status(400).json({
        success: false,
        error: 'Invalid status. Permitted values: "active", "disabled", "paused".',
      });
      return;
    }

    const updated = await dbService.toggleApplicationStatus(applicationId, userId, status);

    res.json({
      success: true,
      application: updated,
      message: `Application status changed to "${status}".`,
    });
  } catch (err) {
    console.error('Failed to toggle application status:', err);
    res.status(404).json({
      success: false,
      error: 'Application not found or unauthorized.',
    });
  }
});

/**
 * POST /api/applications/:id/generate-key
 * Generates an API key if none or revoked
 */
applicationRouter.post('/:id/generate-key', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const applicationId = req.params.id;

    const result = await dbService.generateApiKey(applicationId, userId);
    res.json({
      success: true,
      application: result.application,
      apiKey: result.rawApiKey,
      message: 'New API key generated successfully.',
    });
  } catch (err) {
    console.error('Failed to generate API key:', err);
    res.status(404).json({
      success: false,
      error: 'Application not found or unauthorized.',
    });
  }
});

/**
 * POST /api/applications/:id/roll-key
 * Regenerates the API key, immediately invalidating the previous hash.
 */
applicationRouter.post('/:id/roll-key', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const applicationId = req.params.id;

    const result = await dbService.rollApiKey(applicationId, userId);
    await auditLogService.logEvent({
      eventType: 'api_key_regenerated',
      userId,
      applicationId,
    });

    res.json({
      success: true,
      application: result.application,
      apiKey: result.rawApiKey,
      message: 'API key regenerated successfully. Previous key has been invalidated.',
    });
  } catch (err) {
    console.error('Failed to roll API key:', err);
    res.status(404).json({
      success: false,
      error: 'Application not found or unauthorized.',
    });
  }
});

/**
 * POST /api/applications/:id/revoke-key
 * Revokes the API key immediately blocking external API calls.
 */
applicationRouter.post('/:id/revoke-key', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const applicationId = req.params.id;

    const updated = await dbService.revokeApiKey(applicationId, userId);
    await auditLogService.logEvent({
      eventType: 'api_key_revoked',
      userId,
      applicationId,
    });

    res.json({
      success: true,
      application: updated,
      message: 'API key has been revoked. External calls using this key will be rejected.',
    });
  } catch (err) {
    console.error('Failed to revoke API key:', err);
    res.status(404).json({
      success: false,
      error: 'Application not found or unauthorized.',
    });
  }
});

/**
 * DELETE /api/applications/:id
 * Deletes an application and cascades deletion of notifications and deliveries.
 */
applicationRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const applicationId = req.params.id;

    await dbService.deleteApplication(applicationId, userId);
    await auditLogService.logEvent({
      eventType: 'application_deleted',
      userId,
      applicationId,
    });

    res.json({
      success: true,
      message: 'Application and all associated records permanently deleted.',
    });
  } catch (err) {
    console.error('Failed to delete application:', err);
    res.status(404).json({
      success: false,
      error: 'Application not found or unauthorized to delete.',
    });
  }
});
