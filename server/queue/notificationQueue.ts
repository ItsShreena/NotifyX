import { Queue, QueueEvents, Job } from 'bullmq';
import { getRedisConnectionOptions, isRedisReachable } from './redisClient.ts';
import type { NotificationJobData } from './jobProcessor.ts';
import {
  processNotificationJob,
  handleJobFailure,
} from './jobProcessor.ts';
import { dbService } from '../services/dbService.ts';

export type { NotificationJobData };

export const NOTIFICATION_QUEUE_NAME = 'notification-delivery';

export interface QueueMetrics {
  pending: number;      // waiting + delayed
  processing: number;   // active
  delivered: number;    // completed
  failed: number;       // failed
  retryCount: number;   // total retry attempts across jobs
  delayed: number;
}

export interface QueueJobSummary {
  id: string;
  name: string;
  data: NotificationJobData;
  state: string;
  attemptsMade: number;
  maxAttempts: number;
  failedReason?: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  durationMs?: number;
}

// ==========================================
// EMBEDDED ASYNC QUEUE ENGINE (FALLBACK)
// ==========================================
interface MemoryJob {
  id: string;
  name: string;
  data: NotificationJobData;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  attemptsMade: number;
  maxAttempts: number;
  failedReason?: string;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

class EmbeddedQueue {
  private jobs: Map<string, MemoryJob> = new Map();
  private isProcessing = false;

  async add(data: NotificationJobData, opts?: { jobId?: string }): Promise<{ id: string; name: string; data: NotificationJobData }> {
    const id = opts?.jobId || `job_${data.notificationId}`;
    const existing = this.jobs.get(id);
    if (existing && (existing.state === 'waiting' || existing.state === 'active' || existing.state === 'delayed')) {
      return { id: existing.id, name: existing.name, data: existing.data };
    }

    const job: MemoryJob = {
      id,
      name: 'deliver-notification',
      data,
      state: 'waiting',
      attemptsMade: 0,
      maxAttempts: 3,
      timestamp: Date.now(),
    };

    this.jobs.set(id, job);

    // Schedule processing asynchronously
    setImmediate(() => {
      this.executeJob(id);
    });

    return { id, name: job.name, data };
  }

  private async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.state === 'completed' || job.state === 'failed') return;

    job.state = 'active';
    job.processedOn = Date.now();
    job.attemptsMade += 1;

    try {
      await processNotificationJob(job.data, job.attemptsMade, job.maxAttempts);
      job.state = 'completed';
      job.finishedOn = Date.now();
      job.failedReason = undefined;
    } catch (err: any) {
      job.failedReason = err.message || 'Delivery failed';

      await handleJobFailure(job.id, job.data, err, job.attemptsMade, job.maxAttempts);

      if (job.attemptsMade < job.maxAttempts) {
        job.state = 'delayed';
        const delayMs = Math.pow(2, job.attemptsMade - 1) * 1000;
        console.log(
          `⏳ [EmbeddedQueue] Job ${job.id} will retry in ${delayMs}ms (attempt ${job.attemptsMade + 1}/${job.maxAttempts})`
        );
        setTimeout(() => {
          this.executeJob(jobId);
        }, delayMs);
      } else {
        job.state = 'failed';
        job.finishedOn = Date.now();
      }
    }
  }

  getMetrics(): QueueMetrics {
    let pending = 0;
    let processing = 0;
    let delivered = 0;
    let failed = 0;
    let delayed = 0;
    let retryCount = 0;

    for (const job of this.jobs.values()) {
      if (job.attemptsMade > 1) {
        retryCount += job.attemptsMade - 1;
      }

      if (job.state === 'waiting') pending++;
      else if (job.state === 'delayed') {
        pending++;
        delayed++;
      } else if (job.state === 'active') processing++;
      else if (job.state === 'completed') delivered++;
      else if (job.state === 'failed') failed++;
    }

    return { pending, processing, delivered, failed, delayed, retryCount };
  }

  getRecentJobs(limit: number = 20): QueueJobSummary[] {
    const list = Array.from(this.jobs.values());
    list.sort((a, b) => b.timestamp - a.timestamp);

    return list.slice(0, limit).map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      state: job.state,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.maxAttempts,
      failedReason: job.failedReason,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      durationMs: job.processedOn && job.finishedOn ? job.finishedOn - job.processedOn : undefined,
    }));
  }

  async retryFailed(allowedAppIds?: Set<string>): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.state === 'failed') {
        if (allowedAppIds) {
          const notif = await dbService.getNotificationById(job.data.notificationId);
          if (!notif || !allowedAppIds.has(notif.applicationId)) {
            continue;
          }
        }
        job.state = 'waiting';
        job.attemptsMade = 0;
        job.failedReason = undefined;
        await dbService.updateNotificationStatus(job.data.notificationId, 'retrying').catch(() => {});
        this.executeJob(job.id);
        count++;
      }
    }
    return count;
  }

  async retryJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (job && job.state === 'failed') {
      job.state = 'waiting';
      job.attemptsMade = 0;
      job.failedReason = undefined;
      await dbService.updateNotificationStatus(job.data.notificationId, 'retrying').catch(() => {});
      this.executeJob(job.id);
      return true;
    }
    return false;
  }
}

const embeddedQueue = new EmbeddedQueue();

// ==========================================
// BULLMQ REDIS QUEUE
// ==========================================
let bullQueue: Queue<NotificationJobData> | null = null;
let bullQueueEvents: QueueEvents | null = null;
let redisActive: boolean | null = null;
let lastRedisCheckTime = 0;
const REDIS_CHECK_CACHE_MS = 5000;

/**
 * Checks Redis reachability with 5-second TTL cache to prevent socket flooding
 * while enabling automatic recovery if Redis comes back online.
 */
export async function checkRedisAvailability(forceFresh = false): Promise<boolean> {
  const now = Date.now();
  if (!forceFresh && redisActive !== null && (now - lastRedisCheckTime < REDIS_CHECK_CACHE_MS)) {
    return redisActive;
  }
  lastRedisCheckTime = now;
  redisActive = await isRedisReachable();
  return redisActive;
}

/**
 * Returns the currently active background queue engine.
 */
export async function getActiveQueueEngine(): Promise<'BullMQ (Redis)' | 'EmbeddedQueue (In-Memory)'> {
  const hasRedis = await checkRedisAvailability();
  return hasRedis ? 'BullMQ (Redis)' : 'EmbeddedQueue (In-Memory)';
}

export async function getBullQueue(): Promise<Queue<NotificationJobData> | null> {
  const hasRedis = await checkRedisAvailability();
  if (!hasRedis) {
    return null;
  }

  if (!bullQueue) {
    const connection = getRedisConnectionOptions();
    bullQueue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
      connection: connection as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    });

    bullQueueEvents = new QueueEvents(NOTIFICATION_QUEUE_NAME, { connection: connection as any });
    console.log(`📬 BullMQ Redis Queue "${NOTIFICATION_QUEUE_NAME}" initialized`);
  }

  return bullQueue;
}

/**
 * Enqueues a notification delivery job for asynchronous processing.
 * Dispatches to BullMQ when Redis is available, or to Embedded Queue when not.
 */
export async function addNotificationJob(data: NotificationJobData): Promise<{ id: string; name: string; data: NotificationJobData }> {
  try {
    const queue = await getBullQueue();
    if (queue) {
      const job = await queue.add('deliver-notification', data, {
        jobId: `job_${data.notificationId}`,
      });
      return { id: job.id || `job_${data.notificationId}`, name: job.name, data };
    }
  } catch (err: any) {
    console.warn('⚠️ BullMQ enqueue failed, falling back to embedded queue:', err.message);
    redisActive = false;
  }

  return embeddedQueue.add(data, { jobId: `job_${data.notificationId}` });
}

/**
 * Fetches real metrics from the active queue engine (BullMQ or Embedded).
 */
export async function getQueueMetrics(): Promise<QueueMetrics> {
  try {
    const queue = await getBullQueue();
    if (queue) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);

      let retryCount = 0;
      try {
        const [failedJobs, activeJobs] = await Promise.all([
          queue.getFailed(0, 50),
          queue.getActive(0, 50),
        ]);

        for (const job of failedJobs) {
          if (job.attemptsMade > 1) retryCount += job.attemptsMade - 1;
        }
        for (const job of activeJobs) {
          if (job.attemptsMade > 1) retryCount += job.attemptsMade - 1;
        }
      } catch {
        // Safe fallback
      }

      return {
        pending: waiting + delayed,
        processing: active,
        delivered: completed,
        failed,
        delayed,
        retryCount,
      };
    }
  } catch {
    redisActive = false;
  }

  return embeddedQueue.getMetrics();
}

/**
 * Retrieves the recent jobs from the active queue across all states.
 */
export async function getRecentQueueJobs(limit: number = 20): Promise<QueueJobSummary[]> {
  try {
    const queue = await getBullQueue();
    if (queue) {
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaiting(0, limit),
        queue.getActive(0, limit),
        queue.getCompleted(0, limit),
        queue.getFailed(0, limit),
      ]);

      const allJobs = [...active, ...waiting, ...failed, ...completed];
      allJobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const summaries: QueueJobSummary[] = [];
      for (const job of allJobs.slice(0, limit)) {
        const state = await job.getState();
        const durationMs =
          job.processedOn && job.finishedOn ? job.finishedOn - job.processedOn : undefined;

        summaries.push({
          id: job.id || '',
          name: job.name,
          data: job.data,
          state,
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts || 3,
          failedReason: job.failedReason,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          durationMs,
        });
      }

      return summaries;
    }
  } catch {
    redisActive = false;
  }

  return embeddedQueue.getRecentJobs(limit);
}

/**
 * Retries all currently failed jobs (scoped to requesting user if userId provided).
 */
export async function retryAllFailedJobs(userId?: string): Promise<number> {
  let allowedAppIds: Set<string> | undefined;
  if (userId) {
    const userApps = await dbService.getApplicationsByUserId(userId);
    allowedAppIds = new Set(userApps.map((a) => a.id));
  }

  let count = 0;
  const processedNotifIds = new Set<string>();

  try {
    const queue = await getBullQueue();
    if (queue) {
      const failed = await queue.getFailed(0, 100);
      for (const job of failed) {
        if (allowedAppIds && job.data?.notificationId) {
          const notif = await dbService.getNotificationById(job.data.notificationId);
          if (!notif || !allowedAppIds.has(notif.applicationId)) {
            continue;
          }
        }
        if (job.data?.notificationId) {
          processedNotifIds.add(job.data.notificationId);
          await dbService.updateNotificationStatus(job.data.notificationId, 'retrying').catch(() => {});
        }
        await job.retry();
        count++;
      }
      return count;
    }
  } catch {
    redisActive = false;
  }

  // Retry in-memory queue jobs
  const inMemoryCount = await embeddedQueue.retryFailed(allowedAppIds);
  count += inMemoryCount;

  // Also recover dead-lettered/failed notifications from PostgreSQL/store that are not in the active queue
  try {
    if (userId) {
      const dbFailedNotifs = await dbService.getNotifications({
        userId,
        status: 'failed',
      });
      for (const notif of dbFailedNotifs) {
        if (allowedAppIds && !allowedAppIds.has(notif.applicationId)) {
          continue;
        }
        if (processedNotifIds.has(notif.id)) {
          continue;
        }
        const channel = notif.deliveries?.[0]?.channel || (notif.metadata as any)?.channel || (notif as any).channel || 'in_app';
        await dbService.updateNotificationStatus(notif.id, 'retrying').catch(() => {});
        await addNotificationJob({
          notificationId: notif.id,
          recipientId: notif.recipientId,
          channel,
        });
        processedNotifIds.add(notif.id);
        count++;
      }
    }
  } catch (err: any) {
    console.warn('⚠️ [Queue] Error checking database for failed jobs to retry:', err.message);
  }

  return count;
}

/**
 * Retries a specific job by its ID or notification ID.
 * If not in the active queue (e.g. after process restart), recovers directly from the database record.
 */
export async function retrySpecificJob(jobId: string, userId?: string): Promise<boolean> {
  const notificationId = jobId.startsWith('job_') ? jobId.slice(4) : jobId;

  try {
    const queue = await getBullQueue();
    if (queue) {
      const job = await queue.getJob(jobId);
      if (job) {
        await dbService.updateNotificationStatus(notificationId, 'retrying').catch(() => {});
        await job.retry();
        return true;
      }
    }
  } catch {
    redisActive = false;
  }

  const retriedInMemory = await embeddedQueue.retryJob(jobId);
  if (retriedInMemory) {
    return true;
  }

  // Recovery fallback: If job is not in memory queue (process restart or dead-letter),
  // re-enqueue directly from database state
  const notif = await dbService.getNotificationById(notificationId, userId);
  if (notif && (notif.status === 'failed' || notif.status === 'retrying')) {
    const channel = notif.deliveries?.[0]?.channel || (notif.metadata as any)?.channel || (notif as any).channel || 'in_app';
    await dbService.updateNotificationStatus(notificationId, 'retrying').catch(() => {});
    await addNotificationJob({
      notificationId: notif.id,
      recipientId: notif.recipientId,
      channel,
    });
    return true;
  }

  return false;
}

/**
 * Recovers pending or interrupted notifications from PostgreSQL or memoryStore after a process restart or crash.
 */
export async function recoverPendingNotifications(limit = 100): Promise<number> {
  const pendingNotifs = await dbService.getPendingNotifications(limit);
  let recoveredCount = 0;

  for (const notif of pendingNotifs) {
    try {
      const channel = notif.deliveries?.[0]?.channel || (notif.metadata as any)?.channel || (notif as any).channel || 'in_app';
      await addNotificationJob({
        notificationId: notif.id,
        recipientId: notif.recipientId,
        channel,
      });
      recoveredCount++;
    } catch (err: any) {
      console.warn(`⚠️ [Recovery] Failed to re-enqueue notification ${notif.id}:`, err.message);
    }
  }

  if (recoveredCount > 0) {
    console.log(`🔄 [Recovery] Successfully recovered and re-enqueued ${recoveredCount} pending notifications.`);
  }

  return recoveredCount;
}

