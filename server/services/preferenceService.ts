import { prisma, isDatabaseConnected, withPrismaRetry } from '../db/prisma.ts';
import { dbService } from './dbService.ts';

export const NOTIFICATION_CATEGORIES = [
  'security',
  'payments',
  'orders',
  'comments',
  'tasks',
  'deployments',
  'reminders',
  'system',
  'marketing',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  security: 'Security Alerts & Auth',
  payments: 'Billing & Invoices',
  orders: 'Orders & Fulfillment',
  comments: 'Mentions & Comments',
  tasks: 'Task Assignments & Sprints',
  deployments: 'CI/CD & Deployments',
  reminders: 'Schedules & Reminders',
  system: 'System Health & Maintenance',
  marketing: 'Product Updates & Marketing',
};

export const CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
  security: 'Password resets, suspicious logins, and API credential changes.',
  payments: 'Successful charges, invoice receipts, and billing failures.',
  orders: 'Shipping confirmations, delivery tracking, and returns.',
  comments: 'Replies, team mentions, and collaborative thread notices.',
  tasks: 'Backlog updates, sprint milestones, and ticket status changes.',
  deployments: 'Production release status, canary rollouts, and build logs.',
  reminders: 'Calendar events, deadlines, and automated scheduled followups.',
  system: 'Platform degradation, scheduled maintenance, and incident alerts.',
  marketing: 'Feature announcements, newsletter digests, and partner offers.',
};

/**
 * Sensible default preferences as required by specification:
 * - Security: all enabled
 * - Payments: In-App + Email enabled
 * - Orders: In-App + Email enabled
 * - Comments: In-App enabled
 * - Tasks: In-App enabled
 * - Deployments: In-App enabled
 * - Reminders: In-App + Email enabled
 * - System: In-App enabled
 * - Marketing: disabled
 */
export const DEFAULT_PREFERENCES: Record<
  NotificationCategory,
  { inAppEnabled: boolean; emailEnabled: boolean; pushEnabled: boolean }
> = {
  security: { inAppEnabled: true, emailEnabled: true, pushEnabled: true },
  payments: { inAppEnabled: true, emailEnabled: true, pushEnabled: false },
  orders: { inAppEnabled: true, emailEnabled: true, pushEnabled: false },
  comments: { inAppEnabled: true, emailEnabled: false, pushEnabled: false },
  tasks: { inAppEnabled: true, emailEnabled: false, pushEnabled: false },
  deployments: { inAppEnabled: true, emailEnabled: false, pushEnabled: false },
  reminders: { inAppEnabled: true, emailEnabled: true, pushEnabled: false },
  system: { inAppEnabled: true, emailEnabled: false, pushEnabled: false },
  marketing: { inAppEnabled: false, emailEnabled: false, pushEnabled: false },
};

export const DEFAULT_CHANNELS = {
  inAppEnabled: true,
  emailEnabled: true,
  pushEnabled: false,
};

/**
 * Maps incoming notification types/categories to standard canonical categories.
 */
export function normalizeCategory(rawTypeOrCategory: string | undefined): NotificationCategory {
  if (!rawTypeOrCategory) return 'system';
  const clean = rawTypeOrCategory.trim().toLowerCase();

  if (NOTIFICATION_CATEGORIES.includes(clean as NotificationCategory)) {
    return clean as NotificationCategory;
  }

  // Type aliases normalization
  if (clean.includes('order')) return 'orders';
  if (clean.includes('pay') || clean.includes('bill') || clean.includes('invoice')) return 'payments';
  if (clean.includes('sec') || clean.includes('auth') || clean.includes('login')) return 'security';
  if (clean.includes('comment') || clean.includes('mention') || clean.includes('thread')) return 'comments';
  if (clean.includes('task') || clean.includes('sprint') || clean.includes('jira') || clean.includes('ticket')) return 'tasks';
  if (clean.includes('deploy') || clean.includes('build') || clean.includes('release')) return 'deployments';
  if (clean.includes('remind') || clean.includes('schedule') || clean.includes('event')) return 'reminders';
  if (clean.includes('market') || clean.includes('promo') || clean.includes('news')) return 'marketing';
  if (clean.includes('alert') || clean.includes('sys') || clean.includes('transactional')) return 'system';

  return 'system';
}

export class PreferenceService {
  /**
   * Initializes default preferences for a user if they don't exist yet.
   */
  async ensureDefaultPreferences(userId: string): Promise<void> {
    const isConnected = await isDatabaseConnected();

    if (isConnected) {
      try {
        const existing = await withPrismaRetry(() =>
          prisma.notificationPreference.findMany({
            where: { userId },
          })
        );

        const existingCategories = new Set(existing.map((p) => p.category));

        // Global channels pseudo-category
        if (!existingCategories.has('channels')) {
          await withPrismaRetry(() =>
            prisma.notificationPreference.create({
              data: {
                userId,
                category: 'channels',
                inAppEnabled: DEFAULT_CHANNELS.inAppEnabled,
                emailEnabled: DEFAULT_CHANNELS.emailEnabled,
                pushEnabled: DEFAULT_CHANNELS.pushEnabled,
              },
            })
          );
        }

        // Categories
        for (const cat of NOTIFICATION_CATEGORIES) {
          if (!existingCategories.has(cat)) {
            const def = DEFAULT_PREFERENCES[cat];
            await withPrismaRetry(() =>
              prisma.notificationPreference.create({
                data: {
                  userId,
                  category: cat,
                  inAppEnabled: def.inAppEnabled,
                  emailEnabled: def.emailEnabled,
                  pushEnabled: def.pushEnabled,
                },
              })
            );
          }
        }
        return;
      } catch (err) {
        console.warn('[preferenceService] Database preference init failed, using fallback:', err);
      }
    }

    // Memory Store fallback
    const memStore = dbService.getMemoryPreferences();
    const userPrefs = Array.from(memStore.values()).filter((p) => p.userId === userId);
    const existingCategories = new Set(userPrefs.map((p) => p.category));

    if (!existingCategories.has('channels')) {
      const id = `pref_ch_${userId}`;
      memStore.set(id, {
        id,
        userId,
        category: 'channels',
        inAppEnabled: DEFAULT_CHANNELS.inAppEnabled,
        emailEnabled: DEFAULT_CHANNELS.emailEnabled,
        pushEnabled: DEFAULT_CHANNELS.pushEnabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    for (const cat of NOTIFICATION_CATEGORIES) {
      if (!existingCategories.has(cat)) {
        const id = `pref_${cat}_${userId}`;
        const def = DEFAULT_PREFERENCES[cat];
        memStore.set(id, {
          id,
          userId,
          category: cat,
          inAppEnabled: def.inAppEnabled,
          emailEnabled: def.emailEnabled,
          pushEnabled: def.pushEnabled,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }
  }

  /**
   * Retrieves all notification preferences and global channel states for a user.
   */
  async getUserPreferences(userId: string): Promise<{
    channels: { inAppEnabled: boolean; emailEnabled: boolean; pushEnabled: boolean };
    categories: Array<{
      category: NotificationCategory;
      label: string;
      description: string;
      inAppEnabled: boolean;
      emailEnabled: boolean;
      pushEnabled: boolean;
      updatedAt: string;
    }>;
  }> {
    await this.ensureDefaultPreferences(userId);
    const isConnected = await isDatabaseConnected();

    let list: Array<{
      id: string;
      userId: string;
      category: string;
      inAppEnabled: boolean;
      emailEnabled: boolean;
      pushEnabled: boolean;
      updatedAt: Date;
    }> = [];

    if (isConnected) {
      try {
        list = await withPrismaRetry(() =>
          prisma.notificationPreference.findMany({
            where: { userId },
          })
        );
      } catch (err) {
        console.warn('[preferenceService] Database findMany failed, using fallback:', err);
        const memStore = dbService.getMemoryPreferences();
        list = Array.from(memStore.values()).filter((p) => p.userId === userId);
      }
    } else {
      const memStore = dbService.getMemoryPreferences();
      list = Array.from(memStore.values()).filter((p) => p.userId === userId);
    }

    const channelRecord = list.find((p) => p.category === 'channels');
    const channels = {
      inAppEnabled: channelRecord?.inAppEnabled ?? DEFAULT_CHANNELS.inAppEnabled,
      emailEnabled: channelRecord?.emailEnabled ?? DEFAULT_CHANNELS.emailEnabled,
      pushEnabled: channelRecord?.pushEnabled ?? DEFAULT_CHANNELS.pushEnabled,
    };

    const categories = NOTIFICATION_CATEGORIES.map((cat) => {
      const found = list.find((p) => p.category === cat);
      const def = DEFAULT_PREFERENCES[cat];
      return {
        category: cat,
        label: CATEGORY_LABELS[cat],
        description: CATEGORY_DESCRIPTIONS[cat],
        inAppEnabled: found ? found.inAppEnabled : def.inAppEnabled,
        emailEnabled: found ? found.emailEnabled : def.emailEnabled,
        pushEnabled: found ? found.pushEnabled : def.pushEnabled,
        updatedAt: found ? found.updatedAt.toISOString() : new Date().toISOString(),
      };
    });

    return { channels, categories };
  }

  /**
   * Updates preferences for a specific notification category.
   */
  async updateCategoryPreference(
    userId: string,
    rawCategory: string,
    data: {
      inAppEnabled?: boolean;
      emailEnabled?: boolean;
      pushEnabled?: boolean;
    }
  ): Promise<{
    category: NotificationCategory;
    label: string;
    inAppEnabled: boolean;
    emailEnabled: boolean;
    pushEnabled: boolean;
    updatedAt: string;
  }> {
    const category = rawCategory.trim().toLowerCase() as NotificationCategory;
    if (!NOTIFICATION_CATEGORIES.includes(category)) {
      throw new Error(
        `Unknown category "${rawCategory}". Allowed categories: ${NOTIFICATION_CATEGORIES.join(', ')}.`
      );
    }

    const isConnected = await isDatabaseConnected();
    const now = new Date();

    if (isConnected) {
      try {
        const updated = await withPrismaRetry(() =>
          prisma.notificationPreference.upsert({
            where: {
              userId_category: { userId, category },
            },
            update: {
              ...(data.inAppEnabled !== undefined ? { inAppEnabled: Boolean(data.inAppEnabled) } : {}),
              ...(data.emailEnabled !== undefined ? { emailEnabled: Boolean(data.emailEnabled) } : {}),
              ...(data.pushEnabled !== undefined ? { pushEnabled: Boolean(data.pushEnabled) } : {}),
              updatedAt: now,
            },
            create: {
              userId,
              category,
              inAppEnabled: data.inAppEnabled !== undefined ? Boolean(data.inAppEnabled) : DEFAULT_PREFERENCES[category].inAppEnabled,
              emailEnabled: data.emailEnabled !== undefined ? Boolean(data.emailEnabled) : DEFAULT_PREFERENCES[category].emailEnabled,
              pushEnabled: data.pushEnabled !== undefined ? Boolean(data.pushEnabled) : DEFAULT_PREFERENCES[category].pushEnabled,
              updatedAt: now,
            },
          })
        );

        return {
          category,
          label: CATEGORY_LABELS[category],
          inAppEnabled: updated.inAppEnabled,
          emailEnabled: updated.emailEnabled,
          pushEnabled: updated.pushEnabled,
          updatedAt: updated.updatedAt.toISOString(),
        };
      } catch (err) {
        console.warn('[preferenceService] Database updateCategoryPreference failed, using fallback:', err);
      }
    }

    // Memory store fallback
    const memStore = dbService.getMemoryPreferences();
    const id = `pref_${category}_${userId}`;
    const existing = Array.from(memStore.values()).find((p) => p.userId === userId && p.category === category);
    const def = DEFAULT_PREFERENCES[category];

    const updated = {
      id: existing?.id || id,
      userId,
      category,
      inAppEnabled: data.inAppEnabled !== undefined ? Boolean(data.inAppEnabled) : existing?.inAppEnabled ?? def.inAppEnabled,
      emailEnabled: data.emailEnabled !== undefined ? Boolean(data.emailEnabled) : existing?.emailEnabled ?? def.emailEnabled,
      pushEnabled: data.pushEnabled !== undefined ? Boolean(data.pushEnabled) : existing?.pushEnabled ?? def.pushEnabled,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    memStore.set(updated.id, updated);

    return {
      category,
      label: CATEGORY_LABELS[category],
      inAppEnabled: updated.inAppEnabled,
      emailEnabled: updated.emailEnabled,
      pushEnabled: updated.pushEnabled,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Updates global channel switches (In-App, Email, Push).
   */
  async updateChannelPreferences(
    userId: string,
    data: {
      inAppEnabled?: boolean;
      emailEnabled?: boolean;
      pushEnabled?: boolean;
    }
  ): Promise<{ inAppEnabled: boolean; emailEnabled: boolean; pushEnabled: boolean }> {
    const isConnected = await isDatabaseConnected();
    const now = new Date();

    if (isConnected) {
      try {
        const updated = await withPrismaRetry(() =>
          prisma.notificationPreference.upsert({
            where: {
              userId_category: { userId, category: 'channels' },
            },
            update: {
              ...(data.inAppEnabled !== undefined ? { inAppEnabled: Boolean(data.inAppEnabled) } : {}),
              ...(data.emailEnabled !== undefined ? { emailEnabled: Boolean(data.emailEnabled) } : {}),
              ...(data.pushEnabled !== undefined ? { pushEnabled: Boolean(data.pushEnabled) } : {}),
              updatedAt: now,
            },
            create: {
              userId,
              category: 'channels',
              inAppEnabled: data.inAppEnabled !== undefined ? Boolean(data.inAppEnabled) : DEFAULT_CHANNELS.inAppEnabled,
              emailEnabled: data.emailEnabled !== undefined ? Boolean(data.emailEnabled) : DEFAULT_CHANNELS.emailEnabled,
              pushEnabled: data.pushEnabled !== undefined ? Boolean(data.pushEnabled) : DEFAULT_CHANNELS.pushEnabled,
              updatedAt: now,
            },
          })
        );

        return {
          inAppEnabled: updated.inAppEnabled,
          emailEnabled: updated.emailEnabled,
          pushEnabled: updated.pushEnabled,
        };
      } catch (err) {
        console.warn('[preferenceService] Database updateChannelPreferences failed, using fallback:', err);
      }
    }

    const memStore = dbService.getMemoryPreferences();
    const id = `pref_ch_${userId}`;
    const existing = Array.from(memStore.values()).find((p) => p.userId === userId && p.category === 'channels');

    const updated = {
      id: existing?.id || id,
      userId,
      category: 'channels',
      inAppEnabled: data.inAppEnabled !== undefined ? Boolean(data.inAppEnabled) : existing?.inAppEnabled ?? DEFAULT_CHANNELS.inAppEnabled,
      emailEnabled: data.emailEnabled !== undefined ? Boolean(data.emailEnabled) : existing?.emailEnabled ?? DEFAULT_CHANNELS.emailEnabled,
      pushEnabled: data.pushEnabled !== undefined ? Boolean(data.pushEnabled) : existing?.pushEnabled ?? DEFAULT_CHANNELS.pushEnabled,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    memStore.set(updated.id, updated);

    return {
      inAppEnabled: updated.inAppEnabled,
      emailEnabled: updated.emailEnabled,
      pushEnabled: updated.pushEnabled,
    };
  }

  /**
   * Authoritative check used by Background Worker before attempting delivery:
   * Checks both global channel switch AND category channel configuration.
   */
  async checkDeliveryAllowed(
    recipientId: string,
    rawCategory: string,
    channel: string,
    applicationOwnerId?: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    normalizedCategory: NotificationCategory;
    channel: string;
  }> {
    const normalizedCategory = normalizeCategory(rawCategory);
    const normalizedChannel = channel.toLowerCase();

    // Check if recipient is a registered developer user or if we should check the application's owner preferences
    const targetUserId = applicationOwnerId || recipientId;

    const prefs = await this.getUserPreferences(targetUserId);

    // 1. Check Global Channel switch
    let globalEnabled = true;
    if (normalizedChannel === 'in_app') globalEnabled = prefs.channels.inAppEnabled;
    else if (normalizedChannel === 'email') globalEnabled = prefs.channels.emailEnabled;
    else if (normalizedChannel === 'push') globalEnabled = prefs.channels.pushEnabled;

    if (!globalEnabled) {
      return {
        allowed: false,
        reason: `Global channel "${channel}" is disabled in user notification settings.`,
        normalizedCategory,
        channel: normalizedChannel,
      };
    }

    // 2. Check Category-specific Channel switch
    const catPref = prefs.categories.find((c) => c.category === normalizedCategory);
    let categoryChannelEnabled = true;

    if (catPref) {
      if (normalizedChannel === 'in_app') categoryChannelEnabled = catPref.inAppEnabled;
      else if (normalizedChannel === 'email') categoryChannelEnabled = catPref.emailEnabled;
      else if (normalizedChannel === 'push') categoryChannelEnabled = catPref.pushEnabled;
    } else {
      const def = DEFAULT_PREFERENCES[normalizedCategory];
      if (normalizedChannel === 'in_app') categoryChannelEnabled = def.inAppEnabled;
      else if (normalizedChannel === 'email') categoryChannelEnabled = def.emailEnabled;
      else if (normalizedChannel === 'push') categoryChannelEnabled = def.pushEnabled;
    }

    if (!categoryChannelEnabled) {
      return {
        allowed: false,
        reason: `Channel "${channel}" is disabled for category "${normalizedCategory}" in user preferences.`,
        normalizedCategory,
        channel: normalizedChannel,
      };
    }

    return {
      allowed: true,
      normalizedCategory,
      channel: normalizedChannel,
    };
  }
}

export const preferenceService = new PreferenceService();
