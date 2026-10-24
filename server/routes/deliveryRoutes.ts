import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { dbService } from '../services/dbService.ts';

export const deliveryRouter = Router();

deliveryRouter.use(requireAuth);

/**
 * GET /api/deliveries
 * Returns delivery tracking logs for notifications across developer's apps.
 */
deliveryRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const { status, channel } = req.query;

    const deliveries = await dbService.getDeliveries({
      userId,
      status: status as string | undefined,
      channel: channel as string | undefined,
    });

    res.json({
      success: true,
      deliveries,
    });
  } catch (err) {
    console.error('Failed to query deliveries:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to query delivery logs.',
    });
  }
});
