import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware.ts';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import {
  preferenceService,
  NOTIFICATION_CATEGORIES,
} from '../services/preferenceService.ts';
import type { NotificationCategory } from '../services/preferenceService.ts';

export const preferenceRouter = Router();

// Secure all preference endpoints with developer authentication
preferenceRouter.use(requireAuth);

/**
 * GET /api/preferences
 * Returns the authenticated user's global channel settings and all 9 category preferences.
 * Each user can ONLY access their own preferences.
 */
preferenceRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const preferences = await preferenceService.getUserPreferences(userId);

    res.json({
      success: true,
      channels: preferences.channels,
      categories: preferences.categories,
    });
  } catch (err: any) {
    console.error('Failed to get preferences:', err);
    res.status(500).json({
      success: false,
      error: 'Unable to retrieve notification preferences.',
    });
  }
});

/**
 * PUT /api/preferences/channels
 * Updates global channel toggles (In-App, Email, Push) for the authenticated user.
 */
preferenceRouter.put('/channels', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const { inAppEnabled, emailEnabled, pushEnabled } = req.body;

    if (
      inAppEnabled === undefined &&
      emailEnabled === undefined &&
      pushEnabled === undefined
    ) {
      res.status(400).json({
        success: false,
        error: 'At least one channel state (inAppEnabled, emailEnabled, pushEnabled) must be provided.',
      });
      return;
    }

    const updatedChannels = await preferenceService.updateChannelPreferences(userId, {
      inAppEnabled,
      emailEnabled,
      pushEnabled,
    });

    res.json({
      success: true,
      channels: updatedChannels,
      message: 'Global notification channels updated.',
    });
  } catch (err: any) {
    console.error('Failed to update channel preferences:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update channel preferences.',
    });
  }
});

/**
 * PUT /api/preferences/:category
 * Updates preferences for a specific notification category for the authenticated user.
 * Example body:
 * {
 *   "inAppEnabled": true,
 *   "emailEnabled": false,
 *   "pushEnabled": false
 * }
 */
preferenceRouter.put('/:category', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.developer!.id;
    const rawCategory = req.params.category;
    let { inAppEnabled, emailEnabled, pushEnabled, channels } = req.body;

    // Check if category is valid
    const cleanCategory = rawCategory.trim().toLowerCase();
    if (!NOTIFICATION_CATEGORIES.includes(cleanCategory as NotificationCategory)) {
      res.status(400).json({
        success: false,
        error: `Unknown notification category "${rawCategory}".`,
        allowedCategories: NOTIFICATION_CATEGORIES,
      });
      return;
    }

    // Support both explicit boolean flags and channels list format
    if (Array.isArray(channels)) {
      inAppEnabled = channels.includes('in_app');
      emailEnabled = channels.includes('email');
      pushEnabled = channels.includes('push');
    }

    // Validate payload values
    if (
      inAppEnabled === undefined &&
      emailEnabled === undefined &&
      pushEnabled === undefined
    ) {
      res.status(400).json({
        success: false,
        error: 'At least one channel setting (inAppEnabled, emailEnabled, pushEnabled) must be provided.',
      });
      return;
    }

    const updated = await preferenceService.updateCategoryPreference(userId, cleanCategory, {
      inAppEnabled,
      emailEnabled,
      pushEnabled,
    });

    res.json({
      success: true,
      preference: updated,
      message: `Notification preferences for category "${cleanCategory}" updated successfully.`,
    });
  } catch (err: any) {
    console.error('Failed to update category preference:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to update preference.',
    });
  }
});
