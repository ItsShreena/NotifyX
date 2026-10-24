import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma, isDatabaseConnected, withPrismaRetry } from '../db/prisma.ts';
import type { DeveloperAccount } from '../types/auth.ts';

// Cryptographic SHA-256 hash for API keys
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// In-memory fallback repository aligned 100% with the Prisma schema
interface MemoryStore {
  users: Map<string, { id: string; name: string; email: string
    
    ; passwordHash: string; createdAt: Date; updatedAt: Date }>;
  applications: Map<
    string,
    {
      id: string;
      userId: string;
      name: string;
      description: string | null;
      apiKeyHash: string;
      apiKeyPreview: string;
      apiKeyStatus: string;
      lastActivityAt: Date | null;
      environment: string;
      rateLimitPerSec: number;
      webhookUrl: string | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }
  >;
  notifications: Map<
    string,
    {
      id: string;
      applicationId: string;
      recipientId: string;
      idempotencyKey: string | null;
      type: string;
      title: string;
      message: string;
      priority: string;
      status: string;
      attemptCount: number;
      lastError: string | null;
      retryHistory: Array<{ attempt: number; maxAttempts?: number; timestamp: string; error?: string | null; delayMs?: number; status: string }>;
      readAt: Date | null;
      actionUrl: string | null;
      metadata: Record<string, unknown> | null;
      aiProcessed: boolean;
      aiCategory: string | null;
      aiPriority: string | null;
      aiSummary: string | null;
      aiShouldGroup: boolean;
      aiProcessedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }
  >;
  deliveries: Map<string, { id: string; notificationId: string; channel: string; status: string; statusCode: number | null; attempts: number; maxAttempts: number; latencyMs: number | null; deliveredAt: Date | null; failedAt: Date | null; errorMessage: string | null; provider?: string | null; requestPayload: Record<string, unknown> | null; responseBody: string | null; createdAt: Date; updatedAt: Date }>;
  preferences: Map<string, { id: string; userId: string; category: string; inAppEnabled: boolean; emailEnabled: boolean; pushEnabled: boolean; createdAt: Date; updatedAt: Date }>;
}

const memoryStore: MemoryStore = {
  users: new Map(),
  applications: new Map(),
  notifications: new Map(),
  deliveries: new Map(),
  preferences: new Map(),
};

// Seed default developer account
const SEED_USER_ID = 'dev_notifyx_demo_01';
const SEED_USER_EMAIL = 'developer@notifyx.dev';
const SEED_PASSWORD_HASH = bcrypt.hashSync('Password123!', 10);

memoryStore.users.set(SEED_USER_EMAIL, {
  id: SEED_USER_ID,
  name: 'Alex Morgan',
  email: SEED_USER_EMAIL,
  passwordHash: SEED_PASSWORD_HASH,
  createdAt: new Date('2026-09-15T08:00:00.000Z'),
  updatedAt: new Date('2026-10-02T22:00:00.000Z'),
});

// Seed initial applications owned by this developer (including user examples: ShopEasy, CollegePortal, TaskFlow, DeployMonitor)
const SEED_APPS = [
  {
    id: 'app_shopeasy_retail',
    userId: SEED_USER_ID,
    name: 'ShopEasy',
    description: 'Direct-to-consumer store with real-time order tracking, checkout alerts, and delivery updates.',
    apiKey: 'nx_live_9281a0e8c741492b9f8481230',
    apiKeyPreview: 'nx_live_9281...8123',
    environment: 'production',
    rateLimitPerSec: 250,
    webhookUrl: 'https://api.shopeasy.store/webhooks/notifyx',
    status: 'active',
    apiKeyStatus: 'active',
    lastActivityAt: new Date('2026-10-02T23:42:00.000Z'),
  },
  {
    id: 'app_college_portal',
    userId: SEED_USER_ID,
    name: 'CollegePortal',
    description: 'University ERP student portal for semester grades, attendance alerts, and fee deadline notices.',
    apiKey: 'nx_live_2991e0a29481556ab00199241',
    apiKeyPreview: 'nx_live_2991...9241',
    environment: 'production',
    rateLimitPerSec: 150,
    webhookUrl: 'https://portal.university.edu/api/notify-listener',
    status: 'active',
    apiKeyStatus: 'active',
    lastActivityAt: new Date('2026-10-02T22:50:00.000Z'),
  },
  {
    id: 'app_taskflow_pm',
    userId: SEED_USER_ID,
    name: 'TaskFlow',
    description: 'Agile team collaboration workspace, sprints, code reviews, and mention notices.',
    apiKey: 'nx_test_5502fa012299889f011928499',
    apiKeyPreview: 'nx_test_5502...8499',
    environment: 'staging',
    rateLimitPerSec: 100,
    webhookUrl: 'https://staging-api.taskflow.dev/v1/hooks',
    status: 'active',
    apiKeyStatus: 'active',
    lastActivityAt: new Date('2026-10-02T21:10:00.000Z'),
  },
  {
    id: 'app_deploy_monitor',
    userId: SEED_USER_ID,
    name: 'DeployMonitor',
    description: 'Continuous integration and infrastructure deployment pipeline monitoring and pager alerts.',
    apiKey: 'nx_live_4110b8f41199771ea19920112',
    apiKeyPreview: 'nx_live_4110...0112',
    environment: 'production',
    rateLimitPerSec: 500,
    webhookUrl: 'https://hooks.deploymonitor.internal/events',
    status: 'active',
    apiKeyStatus: 'active',
    lastActivityAt: new Date('2026-10-02T23:35:10.000Z'),
  },
];

for (const app of SEED_APPS) {
  memoryStore.applications.set(app.id, {
    id: app.id,
    userId: app.userId,
    name: app.name,
    description: app.description,
    apiKeyHash: hashApiKey(app.apiKey),
    apiKeyPreview: app.apiKeyPreview,
    apiKeyStatus: app.apiKeyStatus,
    lastActivityAt: app.lastActivityAt,
    environment: app.environment,
    rateLimitPerSec: app.rateLimitPerSec,
    webhookUrl: app.webhookUrl,
    status: app.status,
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-02T18:00:00.000Z'),
  });
}

// Seed initial notifications and deliveries
const SEED_NOTIFS = [
  {
    id: 'notif_001',
    applicationId: 'app_shopeasy_retail',
    recipientId: 'usr_cst_9841',
    type: 'transactional',
    title: 'Order #4821 has been shipped',
    message: 'Your parcel containing 2 items is on the way via FedEx Priority. Expected delivery: Tuesday by 5:00 PM.',
    priority: 'high',
    status: 'delivered',
    channel: 'email',
    statusCode: 200,
    latencyMs: 142,
    createdAt: new Date('2026-10-02T23:42:00Z'),
  },
  {
    id: 'notif_002',
    applicationId: 'app_deploy_monitor',
    recipientId: 'dev_alex_k',
    type: 'system',
    title: 'Your deployment completed successfully',
    message: 'Production release v2.14.0 deployed to us-east-1 cluster across 16 healthy pods. 0 errors detected.',
    priority: 'normal',
    status: 'delivered',
    channel: 'in_app',
    statusCode: 200,
    latencyMs: 46,
    createdAt: new Date('2026-10-02T23:35:10Z'),
  },
  {
    id: 'notif_003',
    applicationId: 'app_college_portal',
    recipientId: 'std_2024_991',
    type: 'alert',
    title: 'Assignment deadline is tomorrow',
    message: 'Distributed Systems: Lab 3 (Raft Consensus Implementation) submission portal closes on Oct 3 at 11:59 PM.',
    priority: 'urgent',
    status: 'delivered',
    channel: 'push',
    statusCode: 200,
    latencyMs: 88,
    createdAt: new Date('2026-10-02T22:50:00Z'),
  },
  {
    id: 'notif_004',
    applicationId: 'app_taskflow_pm',
    recipientId: 'usr_sarah_m',
    type: 'alert',
    title: 'New comment on your task',
    message: 'Priya tagged you on "Database connection pool tuning": "Reviewed the PR, benchmarks look 35% faster. Approved!"',
    priority: 'normal',
    status: 'read',
    channel: 'in_app',
    statusCode: 200,
    latencyMs: 52,
    createdAt: new Date('2026-10-02T21:10:00Z'),
  },
  {
    id: 'notif_005',
    applicationId: 'app_shopeasy_retail',
    recipientId: 'user@example.com',
    type: 'PAYMENT',
    title: 'Payment Failed',
    message: 'Your payment of ₹2,499 failed.',
    priority: 'critical',
    status: 'delivered',
    channel: 'in_app',
    statusCode: 200,
    latencyMs: 38,
    createdAt: new Date('2026-10-02T20:15:00Z'),
  },
];

for (const notif of SEED_NOTIFS) {
  memoryStore.notifications.set(notif.id, {
    id: notif.id,
    applicationId: notif.applicationId,
    recipientId: notif.recipientId,
    idempotencyKey: null,
    type: notif.type,
    title: notif.title,
    message: notif.message,
    priority: notif.priority,
    status: notif.status,
    attemptCount: notif.status === 'failed' ? 3 : 1,
    lastError: notif.status === 'failed' ? 'Carrier connection timed out on attempt 3' : null,
    retryHistory:
      notif.status === 'failed'
        ? [
            { attempt: 1, maxAttempts: 3, timestamp: '2026-10-02T21:10:00Z', error: 'Carrier timeout', delayMs: 1000, status: 'retrying' },
            { attempt: 2, maxAttempts: 3, timestamp: '2026-10-02T21:10:01Z', error: 'Carrier timeout', delayMs: 2000, status: 'retrying' },
            { attempt: 3, maxAttempts: 3, timestamp: '2026-10-02T21:10:03Z', error: 'Carrier connection timed out on attempt 3', delayMs: 0, status: 'failed' },
          ]
        : [
            { attempt: 1, maxAttempts: 3, timestamp: notif.createdAt.toISOString(), error: null, delayMs: 0, status: 'delivered' },
          ],
    readAt: notif.status === 'read' ? new Date() : null,
    actionUrl: null,
    metadata: null,
    aiProcessed: true,
    aiCategory: notif.type,
    aiPriority: notif.priority,
    aiSummary: notif.title,
    aiShouldGroup: notif.type === 'COMMENT' || notif.type === 'TASK',
    aiProcessedAt: notif.createdAt,
    createdAt: notif.createdAt,
    updatedAt: notif.createdAt,
  });

  if (notif.id === 'notif_005') {
    // Exact Section 10 multi-channel delivery showcase:
    // In-App: Delivered, Email: Delivered, Push: Skipped
    memoryStore.deliveries.set(`del_${notif.id}_inapp`, {
      id: `del_${notif.id}_inapp`,
      notificationId: notif.id,
      channel: 'in_app',
      status: 'delivered',
      statusCode: 200,
      attempts: 1,
      maxAttempts: 3,
      latencyMs: 38,
      deliveredAt: notif.createdAt,
      failedAt: null,
      errorMessage: null,
      provider: 'InAppWebSocket',
      requestPayload: { title: notif.title, recipient: notif.recipientId },
      responseBody: '{"delivered":true,"provider":"InAppWebSocket"}',
      createdAt: notif.createdAt,
      updatedAt: notif.createdAt,
    });

    memoryStore.deliveries.set(`del_${notif.id}_email`, {
      id: `del_${notif.id}_email`,
      notificationId: notif.id,
      channel: 'email',
      status: 'delivered',
      statusCode: 200,
      attempts: 1,
      maxAttempts: 3,
      latencyMs: 45,
      deliveredAt: notif.createdAt,
      failedAt: null,
      errorMessage: null,
      provider: 'MockEmailProvider',
      requestPayload: { to: notif.recipientId, subject: notif.title },
      responseBody: '{"delivered":true,"provider":"MockEmailProvider"}',
      createdAt: notif.createdAt,
      updatedAt: notif.createdAt,
    });

    memoryStore.deliveries.set(`del_${notif.id}_push`, {
      id: `del_${notif.id}_push`,
      notificationId: notif.id,
      channel: 'push',
      status: 'skipped',
      statusCode: 403,
      attempts: 0,
      maxAttempts: 3,
      latencyMs: 1,
      deliveredAt: null,
      failedAt: null,
      errorMessage: 'Skipped: Push disabled in recipient preferences',
      provider: 'NotifyX-PreferenceEngine',
      requestPayload: null,
      responseBody: '{"skipped":true,"reason":"Push disabled in user preferences"}',
      createdAt: notif.createdAt,
      updatedAt: notif.createdAt,
    });
  } else if (notif.id === 'notif_001') {
    // High priority: In-App + Email delivered
    memoryStore.deliveries.set(`del_${notif.id}_inapp`, {
      id: `del_${notif.id}_inapp`,
      notificationId: notif.id,
      channel: 'in_app',
      status: 'delivered',
      statusCode: 200,
      attempts: 1,
      maxAttempts: 3,
      latencyMs: 52,
      deliveredAt: notif.createdAt,
      failedAt: null,
      errorMessage: null,
      provider: 'InAppWebSocket',
      requestPayload: { title: notif.title, recipient: notif.recipientId },
      responseBody: '{"delivered":true,"provider":"InAppWebSocket"}',
      createdAt: notif.createdAt,
      updatedAt: notif.createdAt,
    });

    memoryStore.deliveries.set(`del_${notif.id}_email`, {
      id: `del_${notif.id}_email`,
      notificationId: notif.id,
      channel: 'email',
      status: 'delivered',
      statusCode: 200,
      attempts: 1,
      maxAttempts: 3,
      latencyMs: 142,
      deliveredAt: notif.createdAt,
      failedAt: null,
      errorMessage: null,
      provider: 'MockEmailProvider',
      requestPayload: { to: notif.recipientId, subject: notif.title },
      responseBody: '{"delivered":true,"provider":"MockEmailProvider"}',
      createdAt: notif.createdAt,
      updatedAt: notif.createdAt,
    });
  } else {
    const deliveryId = `del_${notif.id}`;
    memoryStore.deliveries.set(deliveryId, {
      id: deliveryId,
      notificationId: notif.id,
      channel: notif.channel,
      status: notif.status === 'read' ? 'delivered' : notif.status,
      statusCode: notif.statusCode,
      attempts: 1,
      maxAttempts: 3,
      latencyMs: notif.latencyMs,
      deliveredAt: notif.createdAt,
      failedAt: null,
      errorMessage: null,
      provider: notif.channel === 'in_app' ? 'InAppWebSocket' : notif.channel === 'email' ? 'MockEmailProvider' : 'MockPushProvider',
      requestPayload: { title: notif.title, recipient: notif.recipientId },
      responseBody: '{"delivered":true}',
      createdAt: notif.createdAt,
      updatedAt: notif.createdAt,
    });
  }
}

/**
 * Unified Database Service leveraging Prisma ORM
 * with transparent PostgreSQL execution and fallback support.
 */
export const dbService = {
  // USER OPERATIONS
  async findUserByEmail(email: string): Promise<DeveloperAccount | null> {
    const normalized = email.toLowerCase().trim();
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        const u = await withPrismaRetry(() =>
          prisma.user.findUnique({
            where: { email: normalized },
          })
        );
        if (u) {
          return { ...u, createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString() };
        }
      } catch (err) {
        console.warn('[dbService] Prisma findUserByEmail failed, using fallback:', err);
      }
    }
    const mem = memoryStore.users.get(normalized);
    return mem ? { ...mem, createdAt: mem.createdAt.toISOString(), updatedAt: mem.updatedAt.toISOString() } : null;
  },

  async findUserById(id: string): Promise<DeveloperAccount | null> {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        const u = await withPrismaRetry(() => prisma.user.findUnique({ where: { id } }));
        if (u) {
          return { ...u, createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString() };
        }
      } catch (err) {
        console.warn('[dbService] Prisma findUserById failed, using fallback:', err);
      }
    }
    for (const mem of memoryStore.users.values()) {
      if (mem.id === id) {
        return { ...mem, createdAt: mem.createdAt.toISOString(), updatedAt: mem.updatedAt.toISOString() };
      }
    }
    return null;
  },

  async createUser(data: { name: string; email: string; passwordHash: string }): Promise<DeveloperAccount> {
    const normalized = data.email.toLowerCase().trim();
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        const created = await withPrismaRetry(() =>
          prisma.user.create({
            data: {
              name: data.name.trim(),
              email: normalized,
              passwordHash: data.passwordHash,
            },
          })
        );
        // Sync memory store
        memoryStore.users.set(normalized, {
          id: created.id,
          name: created.name,
          email: created.email,
          passwordHash: created.passwordHash,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        });
        return { ...created, createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() };
      } catch (err) {
        console.warn('[dbService] Prisma createUser failed, using fallback:', err);
      }
    }
    const id = `dev_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
    const now = new Date();
    const newUser = {
      id,
      name: data.name.trim(),
      email: normalized,
      passwordHash: data.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.users.set(newUser.email, newUser);
    return { ...newUser, createdAt: newUser.createdAt.toISOString(), updatedAt: newUser.updatedAt.toISOString() };
  },

  // APPLICATION OPERATIONS (Respecting developer ownership)
  async getApplicationsByUserId(userId: string) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        const apps = await withPrismaRetry(() =>
          prisma.application.findMany({
            where: { userId },
            include: {
              _count: {
                select: { notifications: true },
              },
              notifications: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { createdAt: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        );

        if (apps.length > 0) {
          return apps.map((app) => ({
            id: app.id,
            userId: app.userId,
            name: app.name,
            description: app.description,
            apiKeyPreview: app.apiKeyPreview,
            apiKeyStatus: app.apiKeyStatus,
            lastActivityAt: app.lastActivityAt || app.notifications[0]?.createdAt || app.updatedAt,
            environment: app.environment,
            rateLimitPerSec: app.rateLimitPerSec,
            webhookUrl: app.webhookUrl,
            status: app.status,
            createdAt: app.createdAt,
            updatedAt: app.updatedAt,
            _count: app._count,
          }));
        }
      } catch (err) {
        console.warn('[dbService] Prisma getApplicationsByUserId failed, using fallback:', err);
      }
    }

    const apps = Array.from(memoryStore.applications.values())
      .filter((app) => app.userId === userId)
      .map((app) => {
        let count = 0;
        let lastNotifDate: Date | null = null;
        for (const notif of memoryStore.notifications.values()) {
          if (notif.applicationId === app.id) {
            count++;
            if (!lastNotifDate || notif.createdAt > lastNotifDate) {
              lastNotifDate = notif.createdAt;
            }
          }
        }
        return {
          ...app,
          apiKeyHash: undefined, // Never expose hash
          lastActivityAt: app.lastActivityAt || lastNotifDate || app.updatedAt,
          _count: { notifications: count },
        };
      });

    return apps;
  },

  async getApplicationById(applicationId: string, userId: string) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        const app = await withPrismaRetry(() =>
          prisma.application.findFirst({
            where: { id: applicationId, userId },
          })
        );
        if (app) return app;
      } catch (err) {
        console.warn('[dbService] Prisma getApplicationById failed, using fallback:', err);
      }
    }
    const app = memoryStore.applications.get(applicationId);
    if (app && app.userId === userId) {
      return { ...app, apiKeyHash: undefined };
    }
    return null;
  },

  async findApplicationByApiKeyHash(apiKeyHash: string) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        const app = await withPrismaRetry(() =>
          prisma.application.findUnique({
            where: { apiKeyHash },
          })
        );
        if (app) return app;
      } catch (err) {
        console.warn('[dbService] Prisma findApplicationByApiKeyHash failed, using fallback:', err);
      }
    }
    for (const app of memoryStore.applications.values()) {
      if (app.apiKeyHash === apiKeyHash) {
        return { ...app };
      }
    }
    return null;
  },

  async touchApplicationActivity(applicationId: string) {
    const now = new Date();
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        await withPrismaRetry(() =>
          prisma.application.update({
            where: { id: applicationId },
            data: { lastActivityAt: now },
          })
        );
        return;
      } catch (err) {
        console.warn('[dbService] Prisma touchApplicationActivity failed, updating memory:', err);
      }
    }
    const app = memoryStore.applications.get(applicationId);
    if (app) {
      app.lastActivityAt = now;
      app.updatedAt = now;
    }
  },

  async createApplication(data: {
    userId: string;
    name: string;
    description?: string;
    environment?: string;
    rateLimitPerSec?: number;
    webhookUrl?: string;
  }) {
    // Generate secure API key with recognizable developer convention prefix
    const prefix = data.environment === 'staging' || data.environment === 'development' ? 'nx_test_' : 'nx_live_';
    const rawSecret = crypto.randomBytes(16).toString('hex');
    const rawApiKey = `${prefix}${rawSecret}`;
    const apiKeyHash = hashApiKey(rawApiKey);
    const apiKeyPreview = `${prefix}${rawSecret.slice(0, 4)}...${rawSecret.slice(-4)}`;

    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        const created = await withPrismaRetry(() =>
          prisma.application.create({
            data: {
              userId: data.userId,
              name: data.name.trim(),
              description: data.description?.trim() || null,
              apiKeyHash,
              apiKeyPreview,
              apiKeyStatus: 'active',
              lastActivityAt: new Date(),
              environment: data.environment || 'production',
              rateLimitPerSec: data.rateLimitPerSec || 100,
              webhookUrl: data.webhookUrl?.trim() || null,
              status: 'active',
            },
          })
        );
        return { application: created, rawApiKey };
      } catch (err) {
        console.warn('[dbService] Prisma application.create failed, using memory fallback:', err);
      }
    }

    const id = `app_${Math.random().toString(36).substring(2, 8)}_${Date.now().toString(36)}`;
    const now = new Date();
    const newApp = {
      id,
      userId: data.userId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      apiKeyHash,
      apiKeyPreview,
      apiKeyStatus: 'active',
      lastActivityAt: now,
      environment: data.environment || 'production',
      rateLimitPerSec: data.rateLimitPerSec || 100,
      webhookUrl: data.webhookUrl?.trim() || null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.applications.set(id, newApp);
    return { application: { ...newApp, apiKeyHash: undefined }, rawApiKey };
  },

  async updateApplication(
    applicationId: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
      environment?: string;
      rateLimitPerSec?: number;
      webhookUrl?: string;
      status?: string;
    }
  ) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        return await withPrismaRetry(() =>
          prisma.application.update({
            where: { id: applicationId, userId },
            data: {
              ...(data.name ? { name: data.name.trim() } : {}),
              ...(data.description !== undefined ? { description: data.description } : {}),
              ...(data.environment ? { environment: data.environment } : {}),
              ...(data.rateLimitPerSec ? { rateLimitPerSec: Number(data.rateLimitPerSec) } : {}),
              ...(data.webhookUrl !== undefined ? { webhookUrl: data.webhookUrl } : {}),
              ...(data.status ? { status: data.status } : {}),
            },
          })
        );
      } catch (err) {
        console.warn('[dbService] Prisma updateApplication failed, using memory fallback:', err);
      }
    }

    const app = memoryStore.applications.get(applicationId);
    if (!app || app.userId !== userId) {
      throw new Error('Application not found or unauthorized');
    }
    if (data.name) app.name = data.name.trim();
    if (data.description !== undefined) app.description = data.description;
    if (data.environment) app.environment = data.environment;
    if (data.rateLimitPerSec) app.rateLimitPerSec = Number(data.rateLimitPerSec);
    if (data.webhookUrl !== undefined) app.webhookUrl = data.webhookUrl;
    if (data.status) app.status = data.status;
    app.updatedAt = new Date();
    return { ...app, apiKeyHash: undefined };
  },

  async toggleApplicationStatus(applicationId: string, userId: string, status: 'active' | 'disabled' | 'paused') {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        return await withPrismaRetry(() =>
          prisma.application.update({
            where: { id: applicationId, userId },
            data: { status },
          })
        );
      } catch (err) {
        console.warn('[dbService] Prisma toggleApplicationStatus failed, using memory fallback:', err);
      }
    }

    const app = memoryStore.applications.get(applicationId);
    if (!app || app.userId !== userId) {
      throw new Error('Application not found or unauthorized');
    }
    app.status = status;
    app.updatedAt = new Date();
    return { ...app, apiKeyHash: undefined };
  },

  async generateApiKey(applicationId: string, userId: string) {
    return this.rollApiKey(applicationId, userId);
  },

  async rollApiKey(applicationId: string, userId: string) {
    const isConnected = await isDatabaseConnected();
    const appRecord = await this.getApplicationById(applicationId, userId);
    if (!appRecord) {
      throw new Error('Application not found or unauthorized');
    }

    const prefix = appRecord.environment === 'staging' || appRecord.environment === 'development' ? 'nx_test_' : 'nx_live_';
    const rawSecret = crypto.randomBytes(16).toString('hex');
    const rawApiKey = `${prefix}${rawSecret}`;
    const apiKeyHash = hashApiKey(rawApiKey);
    const apiKeyPreview = `${prefix}${rawSecret.slice(0, 4)}...${rawSecret.slice(-4)}`;

    if (isConnected) {
      try {
        const updated = await withPrismaRetry(() =>
          prisma.application.update({
            where: { id: applicationId, userId },
            data: {
              apiKeyHash,
              apiKeyPreview,
              apiKeyStatus: 'active',
              updatedAt: new Date(),
            },
          })
        );
        return { application: updated, rawApiKey };
      } catch (err) {
        console.warn('[dbService] Prisma rollApiKey failed, using memory fallback:', err);
      }
    }

    const app = memoryStore.applications.get(applicationId);
    if (!app || app.userId !== userId) {
      throw new Error('Application not found or unauthorized');
    }
    app.apiKeyHash = apiKeyHash;
    app.apiKeyPreview = apiKeyPreview;
    app.apiKeyStatus = 'active';
    app.updatedAt = new Date();
    return { application: { ...app, apiKeyHash: undefined }, rawApiKey };
  },

  async revokeApiKey(applicationId: string, userId: string) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        return await withPrismaRetry(() =>
          prisma.application.update({
            where: { id: applicationId, userId },
            data: {
              apiKeyStatus: 'revoked',
              updatedAt: new Date(),
            },
          })
        );
      } catch (err) {
        console.warn('[dbService] Prisma revokeApiKey failed, using memory fallback:', err);
      }
    }

    const app = memoryStore.applications.get(applicationId);
    if (!app || app.userId !== userId) {
      throw new Error('Application not found or unauthorized');
    }
    app.apiKeyStatus = 'revoked';
    app.updatedAt = new Date();
    return { ...app, apiKeyHash: undefined };
  },

  async deleteApplication(applicationId: string, userId: string) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        return await withPrismaRetry(() =>
          prisma.application.delete({
            where: { id: applicationId, userId },
          })
        );
      } catch (err) {
        console.warn('[dbService] Prisma deleteApplication failed, using memory fallback:', err);
      }
    }
    const app = memoryStore.applications.get(applicationId);
    if (!app || app.userId !== userId) {
      throw new Error('Application not found or unauthorized');
    }
    memoryStore.applications.delete(applicationId);
    // Cascade delete notifications and deliveries
    for (const [notifId, notif] of memoryStore.notifications.entries()) {
      if (notif.applicationId === applicationId) {
        memoryStore.notifications.delete(notifId);
        for (const [delId, del] of memoryStore.deliveries.entries()) {
          if (del.notificationId === notifId) {
            memoryStore.deliveries.delete(delId);
          }
        }
      }
    }
    return true;
  },

  // NOTIFICATION & DELIVERY OPERATIONS
  async getNotifications(options: {
    userId: string;
    applicationId?: string;
    recipientId?: string;
    status?: string;
    startDate?: Date;
  }) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        const dbNotifs = await withPrismaRetry(() =>
          prisma.notification.findMany({
            where: {
              application: {
                userId: options.userId,
                ...(options.applicationId && options.applicationId !== 'all' ? { id: options.applicationId } : {}),
              },
              ...(options.recipientId ? { recipientId: options.recipientId } : {}),
              ...(options.status && options.status !== 'all' ? { status: options.status } : {}),
              ...(options.startDate ? { createdAt: { gte: options.startDate } } : {}),
            },
            include: {
              application: {
                select: { id: true, name: true, environment: true },
              },
              deliveries: true,
            },
            orderBy: { createdAt: 'desc' },
          })
        );
        if (dbNotifs.length > 0) {
          return dbNotifs;
        }
      } catch (err) {
        console.warn('[dbService] Prisma getNotifications failed, falling back:', err);
      }
    }

    const userApps = Array.from(memoryStore.applications.values()).filter((a) => a.userId === options.userId);
    const userAppIds = new Set(userApps.map((a) => a.id));

    let notifs = Array.from(memoryStore.notifications.values()).filter((n) => userAppIds.has(n.applicationId));

    if (options.applicationId && options.applicationId !== 'all') {
      notifs = notifs.filter((n) => n.applicationId === options.applicationId);
    }
    if (options.status && options.status !== 'all') {
      notifs = notifs.filter((n) => n.status === options.status);
    }
    if (options.startDate) {
      notifs = notifs.filter((n) => n.createdAt >= options.startDate!);
    }

    return notifs.map((n) => {
      const app = memoryStore.applications.get(n.applicationId);
      const dels = Array.from(memoryStore.deliveries.values()).filter((d) => d.notificationId === n.id);
      return {
        ...n,
        application: { id: app?.id, name: app?.name, environment: app?.environment },
        deliveries: dels,
      };
    });
  },

  async createNotification(data: {
    applicationId: string;
    recipientId: string;
    type: string;
    title: string;
    message: string;
    priority?: string;
    channel?: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
    initialStatus?: 'pending' | 'delivered';
    idempotencyKey?: string;
  }) {
    const channel = data.channel || 'in_app';
    const status = data.initialStatus || 'pending';
    const isConnected = await isDatabaseConnected();

    // Touch application activity
    await this.touchApplicationActivity(data.applicationId);

    if (isConnected) {
      try {
        return await withPrismaRetry(() =>
          prisma.notification.create({
            data: {
              applicationId: data.applicationId,
              recipientId: data.recipientId,
              idempotencyKey: data.idempotencyKey || undefined,
              type: data.type,
              title: data.title,
              message: data.message,
              priority: data.priority || 'normal',
              status,
              attemptCount: 0,
              lastError: null,
              retryHistory: [],
              actionUrl: data.actionUrl,
              metadata: (data.metadata as any) ?? undefined,
              deliveries: {
                create: {
                  channel,
                  status,
                  statusCode: status === 'delivered' ? 200 : 0,
                  attempts: status === 'delivered' ? 1 : 0,
                  latencyMs: status === 'delivered' ? Math.floor(Math.random() * 60) + 20 : 0,
                  deliveredAt: status === 'delivered' ? new Date() : null,
                  requestPayload: (data.metadata as any) ?? undefined,
                  responseBody: status === 'delivered' ? '{"delivered":true,"provider":"NotifyX-Prisma"}' : undefined,
                },
              },
            },
            include: {
              application: true,
              deliveries: true,
            },
          })
        );
      } catch (err) {
        console.warn('[dbService] Prisma notification.create failed, using memory fallback:', err);
      }
    }

    const notifId = `notif_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const newNotif = {
      id: notifId,
      applicationId: data.applicationId,
      recipientId: data.recipientId,
      idempotencyKey: data.idempotencyKey || null,
      type: data.type,
      title: data.title,
      message: data.message,
      priority: data.priority || 'normal',
      status,
      attemptCount: 0,
      lastError: null,
      retryHistory: [],
      readAt: null,
      actionUrl: data.actionUrl || null,
      metadata: data.metadata || null,
      aiProcessed: false,
      aiCategory: null,
      aiPriority: null,
      aiSummary: null,
      aiShouldGroup: false,
      aiProcessedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.notifications.set(notifId, newNotif);

    const deliveryId = `del_${Math.random().toString(36).substring(2, 9)}`;
    const newDelivery = {
      id: deliveryId,
      notificationId: notifId,
      channel,
      status,
      statusCode: status === 'delivered' ? 200 : 0,
      attempts: status === 'delivered' ? 1 : 0,
      maxAttempts: 3,
      latencyMs: status === 'delivered' ? Math.floor(Math.random() * 60) + 20 : 0,
      deliveredAt: status === 'delivered' ? now : null,
      failedAt: null,
      errorMessage: null,
      requestPayload: data.metadata || null,
      responseBody: status === 'delivered' ? '{"delivered":true,"provider":"NotifyX-Prisma"}' : null,
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.deliveries.set(deliveryId, newDelivery);

    const app = memoryStore.applications.get(data.applicationId);
    return {
      ...newNotif,
      application: app,
      deliveries: [newDelivery],
    };
  },

  async findNotificationByIdempotencyKey(applicationId: string, idempotencyKey: string) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      return await prisma.notification.findUnique({
        where: {
          applicationId_idempotencyKey: {
            applicationId,
            idempotencyKey,
          },
        },
        include: {
          application: true,
          deliveries: true,
        },
      });
    }

    for (const notif of memoryStore.notifications.values()) {
      if (notif.applicationId === applicationId && notif.idempotencyKey === idempotencyKey) {
        const app = memoryStore.applications.get(applicationId);
        const dels = Array.from(memoryStore.deliveries.values()).filter((d) => d.notificationId === notif.id);
        return {
          ...notif,
          application: app,
          deliveries: dels,
        };
      }
    }
    return null;
  },

  async recordNotificationAttempt(
    notificationId: string,
    details: {
      attempt: number;
      maxAttempts: number;
      error?: string;
      delayMs?: number;
      status: 'retrying' | 'delivered' | 'failed' | 'skipped';
    }
  ) {
    const isConnected = await isDatabaseConnected();
    const now = new Date();
    const entry = {
      attempt: details.attempt,
      maxAttempts: details.maxAttempts,
      timestamp: now.toISOString(),
      error: details.error || null,
      delayMs: details.delayMs || 0,
      status: details.status,
    };

    if (isConnected) {
      try {
        const existing = await withPrismaRetry(() =>
          prisma.notification.findUnique({
            where: { id: notificationId },
            select: { retryHistory: true },
          })
        );
        if (existing) {
          const history = Array.isArray(existing?.retryHistory)
            ? [...existing.retryHistory, entry]
            : [entry];

          await withPrismaRetry(() =>
            prisma.notification.update({
              where: { id: notificationId },
              data: {
                status: details.status,
                attemptCount: details.attempt,
                lastError: details.error || null,
                retryHistory: history as any,
                updatedAt: now,
              },
            })
          );
          return;
        }
      } catch (err) {
        console.warn('[dbService] Prisma recordNotificationAttempt failed, using memory fallback:', err);
      }
    }

    const notif = memoryStore.notifications.get(notificationId);
    if (notif) {
      notif.status = details.status;
      notif.attemptCount = details.attempt;
      notif.lastError = details.error || null;
      notif.retryHistory = [...(notif.retryHistory || []), entry];
      notif.updatedAt = now;
    }
  },

  /**
   * Directly updates notification status and optional error in database/memory.
   */
  async updateNotificationStatus(id: string, status: string, error?: string) {
    const isConnected = await isDatabaseConnected();
    const now = new Date();
    if (isConnected) {
      try {
        await withPrismaRetry(() =>
          prisma.notification.update({
            where: { id },
            data: {
              status,
              ...(error !== undefined ? { lastError: error } : {}),
              updatedAt: now,
            },
          })
        );
        return;
      } catch (err) {
        console.warn('[dbService] Prisma updateNotificationStatus failed:', err);
      }
    }
    const notif = memoryStore.notifications.get(id);
    if (notif) {
      notif.status = status;
      if (error !== undefined) notif.lastError = error;
      notif.updatedAt = now;
    }
  },

  /**
   * Fetches un-processed or interrupted notifications for process restart recovery.
   */
  async getPendingNotifications(limit = 100) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        return await withPrismaRetry(() =>
          prisma.notification.findMany({
            where: {
              status: { in: ['pending', 'retrying'] },
            },
            include: {
              application: true,
              deliveries: true,
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
          })
        );
      } catch (err) {
        console.warn('[dbService] Prisma getPendingNotifications failed, using memory fallback:', err);
      }
    }

    return Array.from(memoryStore.notifications.values())
      .filter((n) => n.status === 'pending' || n.status === 'retrying')
      .slice(0, limit)
      .map((n) => {
        const app = memoryStore.applications.get(n.applicationId);
        const dels = Array.from(memoryStore.deliveries.values()).filter((d) => d.notificationId === n.id);
        return {
          ...n,
          application: app || null,
          deliveries: dels,
        };
      });
  },

  async getNotificationById(id: string, userId?: string) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      try {
        const dbNotif = await withPrismaRetry(() =>
          prisma.notification.findUnique({
            where: { id },
            include: {
              application: true,
              deliveries: true,
            },
          })
        );
        if (dbNotif) {
          if (userId && dbNotif.application?.userId !== userId) {
            return null; // Enforce tenant isolation against IDOR
          }
          return dbNotif;
        }
      } catch (err) {
        console.warn('[dbService] Prisma getNotificationById failed, using fallback:', err);
      }
    }

    const notif = memoryStore.notifications.get(id);
    if (!notif) return null;
    const app = memoryStore.applications.get(notif.applicationId);
    if (userId && (!app || app.userId !== userId)) {
      return null; // Enforce tenant isolation against IDOR
    }
    const dels = Array.from(memoryStore.deliveries.values()).filter((d) => d.notificationId === id);
    return {
      ...notif,
      application: app,
      deliveries: dels,
    };
  },

  async getDeliveriesByNotificationId(notificationId: string) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      return await prisma.notificationDelivery.findMany({
        where: { notificationId },
      });
    }
    return Array.from(memoryStore.deliveries.values()).filter((d) => d.notificationId === notificationId);
  },

  async updateNotificationDeliveryStatus(
    notificationId: string,
    status: 'delivered' | 'failed' | 'skipped',
    details?: {
      channel?: string;
      attempts?: number;
      latencyMs?: number;
      error?: string;
      statusCode?: number;
      responseBody?: string;
      provider?: string;
    }
  ) {
    if (details?.channel) {
      return this.upsertChannelDelivery(notificationId, details.channel, {
        status,
        statusCode: details.statusCode,
        attempts: details.attempts,
        latencyMs: details.latencyMs,
        errorMessage: details.error,
        responseBody: details.responseBody,
        provider: details.provider,
      });
    }

    const isConnected = await isDatabaseConnected();
    const now = new Date();
    const finalNotifStatus = status;

    if (isConnected) {
      try {
        await withPrismaRetry(() =>
          prisma.notification.update({
            where: { id: notificationId },
            data: { status: finalNotifStatus, updatedAt: now },
          })
        );

        const delivery = await withPrismaRetry(() =>
          prisma.notificationDelivery.findFirst({
            where: { notificationId },
            orderBy: { createdAt: 'desc' },
          })
        );

        if (delivery) {
          await withPrismaRetry(() =>
            prisma.notificationDelivery.update({
              where: { id: delivery.id },
              data: {
                status,
                statusCode: details?.statusCode ?? (status === 'delivered' ? 200 : 500),
                attempts: details?.attempts ?? (delivery.attempts + 1),
                latencyMs: details?.latencyMs ?? 50,
                deliveredAt: status === 'delivered' ? now : null,
                failedAt: status === 'failed' || status === 'skipped' ? now : null,
                errorMessage: details?.error || null,
                responseBody: details?.responseBody || (status === 'delivered' ? '{"delivered":true}' : null),
                updatedAt: now,
              },
            })
          );
        }
        return;
      } catch (err) {
        console.warn('[dbService] Prisma recordDeliveryAttempt failed, using memory fallback:', err);
      }
    }

    const notif = memoryStore.notifications.get(notificationId);
    if (notif) {
      notif.status = finalNotifStatus;
      notif.updatedAt = now;
    }

    for (const del of memoryStore.deliveries.values()) {
      if (del.notificationId === notificationId) {
        del.status = status;
        del.statusCode = details?.statusCode ?? (status === 'delivered' ? 200 : 500);
        del.attempts = details?.attempts ?? (del.attempts + 1);
        del.latencyMs = details?.latencyMs ?? 50;
        del.deliveredAt = status === 'delivered' ? now : null;
        del.failedAt = status === 'failed' || status === 'skipped' ? now : null;
        del.errorMessage = details?.error || null;
        del.responseBody = details?.responseBody || (status === 'delivered' ? '{"delivered":true}' : null);
        del.updatedAt = now;
      }
    }
  },

  /**
   * Authoritatively upserts a channel delivery record.
   * Guarantees exactly one delivery record per (notificationId, channel) combination
   * without duplicating records during retries.
   */
  async upsertChannelDelivery(
    notificationId: string,
    channel: string,
    data: {
      status: 'pending' | 'processing' | 'delivered' | 'failed' | 'skipped';
      statusCode?: number;
      attempts?: number;
      maxAttempts?: number;
      latencyMs?: number;
      deliveredAt?: Date | null;
      failedAt?: Date | null;
      errorMessage?: string | null;
      provider?: string | null;
      requestPayload?: Record<string, unknown> | null;
      responseBody?: string | null;
    }
  ) {
    const isConnected = await isDatabaseConnected();
    const now = new Date();
    const normalizedChannel = channel.toLowerCase();

    // Update notification overall status if delivered
    if (data.status === 'delivered') {
      if (isConnected) {
        await prisma.notification.update({
          where: { id: notificationId },
          data: { status: 'delivered', updatedAt: now },
        }).catch(() => {});
      } else {
        const notif = memoryStore.notifications.get(notificationId);
        if (notif) {
          notif.status = 'delivered';
          notif.updatedAt = now;
        }
      }
    }

    if (isConnected) {
      try {
        const existing = await withPrismaRetry(() =>
          prisma.notificationDelivery.findFirst({
            where: { notificationId, channel: normalizedChannel },
          })
        );

        if (existing) {
          return await withPrismaRetry(() =>
            prisma.notificationDelivery.update({
              where: { id: existing.id },
              data: {
                status: data.status,
                statusCode: data.statusCode ?? existing.statusCode,
                attempts: data.attempts !== undefined ? data.attempts : existing.attempts + 1,
                maxAttempts: data.maxAttempts ?? existing.maxAttempts,
                latencyMs: data.latencyMs ?? existing.latencyMs,
                deliveredAt: data.deliveredAt !== undefined ? data.deliveredAt : (data.status === 'delivered' ? now : existing.deliveredAt),
                failedAt: data.failedAt !== undefined ? data.failedAt : (data.status === 'failed' ? now : existing.failedAt),
                errorMessage: data.errorMessage !== undefined ? data.errorMessage : existing.errorMessage,
                responseBody: data.responseBody !== undefined ? data.responseBody : existing.responseBody,
                updatedAt: now,
              },
            })
          );
        } else {
          return await withPrismaRetry(() =>
            prisma.notificationDelivery.create({
              data: {
                notificationId,
                channel: normalizedChannel,
                status: data.status,
                statusCode: data.statusCode ?? (data.status === 'delivered' ? 200 : data.status === 'skipped' ? 403 : 500),
                attempts: data.attempts ?? (data.status === 'delivered' ? 1 : 0),
                maxAttempts: data.maxAttempts ?? 3,
                latencyMs: data.latencyMs ?? 50,
                deliveredAt: data.status === 'delivered' ? now : null,
                failedAt: data.status === 'failed' ? now : null,
                errorMessage: data.errorMessage || null,
                requestPayload: (data.requestPayload as any) || undefined,
                responseBody: data.responseBody || (data.status === 'delivered' ? '{"delivered":true}' : null),
              },
            })
          );
        }
      } catch (err) {
        console.warn('[dbService] Prisma notificationDelivery write failed, using fallback:', err);
      }
    }

    // In-Memory store
    for (const del of memoryStore.deliveries.values()) {
      if (del.notificationId === notificationId && del.channel.toLowerCase() === normalizedChannel) {
        del.status = data.status;
        if (data.statusCode !== undefined) del.statusCode = data.statusCode;
        if (data.attempts !== undefined) del.attempts = data.attempts;
        else if (data.status === 'delivered' || data.status === 'failed') del.attempts += 1;
        if (data.latencyMs !== undefined) del.latencyMs = data.latencyMs;
        if (data.deliveredAt !== undefined) del.deliveredAt = data.deliveredAt;
        else if (data.status === 'delivered') del.deliveredAt = now;
        if (data.failedAt !== undefined) del.failedAt = data.failedAt;
        else if (data.status === 'failed') del.failedAt = now;
        if (data.errorMessage !== undefined) del.errorMessage = data.errorMessage;
        if (data.provider !== undefined) del.provider = data.provider;
        if (data.responseBody !== undefined) del.responseBody = data.responseBody;
        del.updatedAt = now;
        return del;
      }
    }

    const deliveryId = `del_${Math.random().toString(36).substring(2, 9)}`;
    const newDelivery = {
      id: deliveryId,
      notificationId,
      channel: normalizedChannel,
      status: data.status,
      statusCode: data.statusCode ?? (data.status === 'delivered' ? 200 : data.status === 'skipped' ? 403 : 500),
      attempts: data.attempts ?? (data.status === 'delivered' ? 1 : 0),
      maxAttempts: data.maxAttempts ?? 3,
      latencyMs: data.latencyMs ?? 50,
      deliveredAt: data.status === 'delivered' ? now : null,
      failedAt: data.status === 'failed' ? now : null,
      errorMessage: data.errorMessage || null,
      provider: data.provider || null,
      requestPayload: data.requestPayload || null,
      responseBody: data.responseBody || (data.status === 'delivered' ? '{"delivered":true}' : null),
      createdAt: now,
      updatedAt: now,
    };
    memoryStore.deliveries.set(deliveryId, newDelivery);
    return newDelivery;
  },

  async getChannelDeliveryStats(userId: string) {
    const apps = await this.getApplicationsByUserId(userId);
    const appIds = new Set(apps.map((a) => a.id));

    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      const notifications = await prisma.notification.findMany({
        where: { applicationId: { in: Array.from(appIds) } },
        include: { deliveries: true },
      });
      return this.computeChannelStats(notifications);
    }

    const userNotifs = Array.from(memoryStore.notifications.values()).filter((n) =>
      appIds.has(n.applicationId)
    );
    const mapped = userNotifs.map((n) => {
      const dels = Array.from(memoryStore.deliveries.values()).filter((d) => d.notificationId === n.id);
      return { ...n, deliveries: dels };
    });
    return this.computeChannelStats(mapped);
  },

  computeChannelStats(notifications: any[]) {
    const inApp = { delivered: 0, failed: 0, skipped: 0, pending: 0 };
    const email = { delivered: 0, failed: 0, skipped: 0, pending: 0 };
    const push = { delivered: 0, failed: 0, skipped: 0, pending: 0 };

    for (const notif of notifications) {
      const dels = notif.deliveries || [];
      for (const d of dels) {
        const ch = (d.channel || '').toLowerCase();
        const st = (d.status || '').toLowerCase();

        let target: { delivered: number; failed: number; skipped: number; pending: number } | null = null;
        if (ch === 'in_app') target = inApp;
        else if (ch === 'email') target = email;
        else if (ch === 'push') target = push;

        if (target) {
          if (st === 'delivered') target.delivered++;
          else if (st === 'failed') target.failed++;
          else if (st === 'skipped') target.skipped++;
          else target.pending++;
        }
      }
    }

    return {
      totalNotifications: notifications.length,
      inApp,
      email,
      push,
    };
  },

  async updateNotificationAiMetadata(
    id: string,
    aiData: {
      aiCategory: string;
      aiPriority: string;
      aiSummary?: string | null;
      aiShouldGroup?: boolean;
      finalPriority?: string;
      finalType?: string;
    }
  ) {
    const isConnected = await isDatabaseConnected();
    const now = new Date();

    if (isConnected) {
      try {
        return await withPrismaRetry(() =>
          prisma.notification.update({
            where: { id },
            data: {
              aiProcessed: true,
              aiCategory: aiData.aiCategory,
              aiPriority: aiData.aiPriority,
              aiSummary: aiData.aiSummary || null,
              aiShouldGroup: Boolean(aiData.aiShouldGroup),
              aiProcessedAt: now,
              ...(aiData.finalPriority ? { priority: aiData.finalPriority } : {}),
              ...(aiData.finalType ? { type: aiData.finalType } : {}),
            },
            include: {
              application: true,
              deliveries: true,
            },
          })
        );
      } catch (err) {
        console.warn('[dbService] Prisma updateNotificationAiMetadata failed, using memory fallback:', err);
      }
    }

    const notif = memoryStore.notifications.get(id);
    if (notif) {
      notif.aiProcessed = true;
      notif.aiCategory = aiData.aiCategory;
      notif.aiPriority = aiData.aiPriority;
      notif.aiSummary = aiData.aiSummary || null;
      notif.aiShouldGroup = Boolean(aiData.aiShouldGroup);
      notif.aiProcessedAt = now;
      if (aiData.finalPriority) notif.priority = aiData.finalPriority;
      if (aiData.finalType) notif.type = aiData.finalType;
      notif.updatedAt = now;
    }
    return notif;
  },

  async getAiAnalytics(userId: string) {
    const apps = await this.getApplicationsByUserId(userId);
    const appIds = new Set(apps.map((a) => a.id));

    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      const notifications = await prisma.notification.findMany({
        where: { applicationId: { in: Array.from(appIds) } },
      });
      return this.computeAiStats(notifications);
    }

    const userNotifs = Array.from(memoryStore.notifications.values()).filter((n) =>
      appIds.has(n.applicationId)
    );
    return this.computeAiStats(userNotifs);
  },

  computeAiStats(notifications: any[]) {
    let analyzed = 0;
    let failures = 0;
    let highPriority = 0;
    let criticalPriority = 0;
    let grouped = 0;
    let summarized = 0;

    for (const n of notifications) {
      if (n.aiProcessed) {
        analyzed++;
      }
      if (n.metadata?.aiFallback || (n.aiCategory === 'SYSTEM' && n.metadata?.fallback)) {
        failures++;
      }
      if (n.priority === 'high' || n.aiPriority === 'high') {
        highPriority++;
      }
      if (n.priority === 'critical' || n.aiPriority === 'critical') {
        criticalPriority++;
      }
      if (n.aiShouldGroup) {
        grouped++;
      }
      if (n.aiSummary) {
        summarized++;
      }
    }

    return {
      analyzed,
      failures,
      highPriority,
      criticalPriority,
      grouped,
      summarized,
      total: notifications.length,
    };
  },

  async markNotificationRead(id: string, userId?: string) {
    const isConnected = await isDatabaseConnected();
    const now = new Date();

    if (isConnected) {
      if (userId) {
        const existing = await prisma.notification.findFirst({
          where: { id, application: { userId } },
        });
        if (!existing) return null;
      }

      return await prisma.notification.update({
        where: { id },
        data: { status: 'read', readAt: now },
      });
    }

    const notif = memoryStore.notifications.get(id);
    if (notif) {
      if (userId) {
        const app = memoryStore.applications.get(notif.applicationId);
        if (!app || app.userId !== userId) return null;
      }

      notif.status = 'read';
      notif.readAt = now;
      notif.updatedAt = now;
    }
    return notif;
  },

  async getNotificationByIdForApp(id: string, applicationId: string) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      return await prisma.notification.findFirst({
        where: { id, applicationId },
      });
    }
    const notif = memoryStore.notifications.get(id);
    if (notif && notif.applicationId === applicationId) {
      return notif;
    }
    return null;
  },

  async getNotificationsForApp(
    applicationId: string,
    filter?: {
      recipientId?: string;
      status?: string;
      type?: string;
      priority?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const isConnected = await isDatabaseConnected();
    const limit = Math.min(Math.max(Number(filter?.limit) || 20, 1), 100);
    const offset = Math.max(Number(filter?.offset) || 0, 0);

    if (isConnected) {
      const whereClause = {
        applicationId,
        ...(filter?.recipientId ? { recipientId: filter.recipientId } : {}),
        ...(filter?.status && filter.status !== 'all' ? { status: filter.status } : {}),
        ...(filter?.type && filter.type !== 'all' ? { type: filter.type } : {}),
        ...(filter?.priority && filter.priority !== 'all' ? { priority: filter.priority } : {}),
      };

      const [total, notifications] = await Promise.all([
        prisma.notification.count({ where: whereClause }),
        prisma.notification.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
      ]);

      return { total, notifications, count: notifications.length };
    }

    let items = Array.from(memoryStore.notifications.values()).filter((n) => n.applicationId === applicationId);

    if (filter?.recipientId) {
      items = items.filter((n) => n.recipientId === filter.recipientId);
    }
    if (filter?.status && filter.status !== 'all') {
      items = items.filter((n) => n.status === filter.status);
    }
    if (filter?.type && filter.type !== 'all') {
      items = items.filter((n) => n.type === filter.type);
    }
    if (filter?.priority && filter.priority !== 'all') {
      items = items.filter((n) => n.priority === filter.priority);
    }

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return { total, notifications: paginated, count: paginated.length };
  },

  async markNotificationReadForApp(id: string, applicationId: string) {
    const isConnected = await isDatabaseConnected();
    const now = new Date();

    if (isConnected) {
      const existing = await prisma.notification.findFirst({
        where: { id, applicationId },
      });
      if (!existing) {
        throw new Error('Notification not found or unauthorized.');
      }
      return await prisma.notification.update({
        where: { id },
        data: { status: 'read', readAt: now },
      });
    }

    const notif = memoryStore.notifications.get(id);
    if (!notif || notif.applicationId !== applicationId) {
      throw new Error('Notification not found or unauthorized.');
    }
    notif.status = 'read';
    notif.readAt = now;
    notif.updatedAt = now;
    return notif;
  },

  async markAllNotificationsRead(userId: string) {
    const isConnected = await isDatabaseConnected();
    const now = new Date();

    if (isConnected) {
      return await prisma.notification.updateMany({
        where: {
          application: { userId },
          status: { not: 'read' },
        },
        data: { status: 'read', readAt: now },
      });
    }

    const userApps = Array.from(memoryStore.applications.values()).filter((a) => a.userId === userId);
    const userAppIds = new Set(userApps.map((a) => a.id));

    let updated = 0;
    for (const notif of memoryStore.notifications.values()) {
      if (userAppIds.has(notif.applicationId) && notif.status !== 'read') {
        notif.status = 'read';
        notif.readAt = now;
        notif.updatedAt = now;
        updated++;
      }
    }
    return { count: updated };
  },

  // DELIVERY LOGS OPERATIONS
  async getDeliveries(options: { userId: string; status?: string; channel?: string; startDate?: Date }) {
    const isConnected = await isDatabaseConnected();

    if (isConnected) {
      try {
        const dbDeliveries = await withPrismaRetry(() =>
          prisma.notificationDelivery.findMany({
            where: {
              notification: {
                application: { userId: options.userId },
              },
              ...(options.status && options.status !== 'all' ? { status: options.status } : {}),
              ...(options.channel && options.channel !== 'all' ? { channel: options.channel } : {}),
              ...(options.startDate ? { createdAt: { gte: options.startDate } } : {}),
            },
            include: {
              notification: {
                include: {
                  application: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        );
        if (dbDeliveries.length > 0) {
          return dbDeliveries;
        }
      } catch (err) {
        console.warn('[dbService] Prisma getDeliveries failed, falling back:', err);
      }
    }

    const userApps = Array.from(memoryStore.applications.values()).filter((a) => a.userId === options.userId);
    const userAppIds = new Set(userApps.map((a) => a.id));

    let deliveries = Array.from(memoryStore.deliveries.values())
      .map((d) => {
        const notif = memoryStore.notifications.get(d.notificationId);
        const app = notif ? memoryStore.applications.get(notif.applicationId) : null;
        return {
          ...d,
          notification: notif ? { ...notif, application: app } : null,
        };
      })
      .filter((d) => d.notification && userAppIds.has(d.notification.applicationId));

    if (options.status && options.status !== 'all') {
      deliveries = deliveries.filter((d) => d.status.toLowerCase() === options.status!.toLowerCase());
    }
    if (options.channel && options.channel !== 'all') {
      deliveries = deliveries.filter((d) => d.channel.toLowerCase() === options.channel!.toLowerCase());
    }
    if (options.startDate) {
      deliveries = deliveries.filter((d) => d.createdAt >= options.startDate!);
    }

    return deliveries;
  },

  // USER NOTIFICATION PREFERENCES OPERATIONS
  async getUserPreferences(userId: string) {
    const isConnected = await isDatabaseConnected();
    if (isConnected) {
      return await prisma.notificationPreference.findMany({
        where: { userId },
      });
    }
    return Array.from(memoryStore.preferences.values()).filter(
      (p) => p.userId === userId
    );
  },

  async upsertUserPreference(data: {
    userId: string;
    category: string;
    inAppEnabled?: boolean;
    emailEnabled?: boolean;
    pushEnabled?: boolean;
  }) {
    const category = data.category || 'all';
    const isConnected = await isDatabaseConnected();

    if (isConnected) {
      return await prisma.notificationPreference.upsert({
        where: {
          userId_category: {
            userId: data.userId,
            category,
          },
        },
        update: {
          ...(data.inAppEnabled !== undefined ? { inAppEnabled: data.inAppEnabled } : {}),
          ...(data.emailEnabled !== undefined ? { emailEnabled: data.emailEnabled } : {}),
          ...(data.pushEnabled !== undefined ? { pushEnabled: data.pushEnabled } : {}),
        },
        create: {
          userId: data.userId,
          category,
          inAppEnabled: data.inAppEnabled ?? true,
          emailEnabled: data.emailEnabled ?? true,
          pushEnabled: data.pushEnabled ?? false,
        },
      });
    }

    const key = `${data.userId}:${category}`;
    const now = new Date();
    const existing = memoryStore.preferences.get(key);

    const updated = {
      id: existing?.id || `pref_${Math.random().toString(36).substring(2, 9)}`,
      userId: data.userId,
      category,
      inAppEnabled: data.inAppEnabled ?? existing?.inAppEnabled ?? true,
      emailEnabled: data.emailEnabled ?? existing?.emailEnabled ?? true,
      pushEnabled: data.pushEnabled ?? existing?.pushEnabled ?? false,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    memoryStore.preferences.set(key, updated);
    return updated;
  },

  getMemoryPreferences() {
    return memoryStore.preferences;
  },
};
