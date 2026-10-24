import { Worker, Job } from 'bullmq';
import { getRedisConnectionOptions, isRedisReachable } from './redisClient.ts';
import { NOTIFICATION_QUEUE_NAME } from './notificationQueue.ts';
import type { NotificationJobData } from './jobProcessor.ts';
import {
  processNotificationJob,
  handleJobFailure,
} from './jobProcessor.ts';

let bullWorkerInstance: Worker<NotificationJobData> | null = null;
let isStarted = false;

/**
 * Initializes and starts the background notification delivery worker.
 * If Redis is reachable, initializes BullMQ Worker.
 * If Redis is not reachable, the Embedded Queue Worker handles execution cleanly without ECONNREFUSED errors.
 */
export async function startNotificationWorker(): Promise<Worker<NotificationJobData> | null> {
  if (bullWorkerInstance) {
    return bullWorkerInstance;
  }

  const hasRedis = await isRedisReachable();
  const connOpts = getRedisConnectionOptions();

  if (!hasRedis) {
    if (!isStarted) {
      console.log(
        `📦 [NotificationWorker] Redis not listening at ${connOpts.host}:${connOpts.port}. Embedded asynchronous queue engine active.`
      );
      isStarted = true;
    }
    return null;
  }

  try {
    bullWorkerInstance = new Worker<NotificationJobData>(
      NOTIFICATION_QUEUE_NAME,
      async (job: Job<NotificationJobData>) => {
        const result = await processNotificationJob(
          job.data,
          job.attemptsMade,
          job.opts.attempts || 3
        );
        return result;
      },
      {
        connection: connOpts as any,
        concurrency: 5,
      }
    );

    bullWorkerInstance.on('failed', async (job, err) => {
      if (!job) return;
      await handleJobFailure(
        job.id || '',
        job.data,
        err,
        job.attemptsMade,
        job.opts.attempts || 3
      );
    });

    bullWorkerInstance.on('error', (err) => {
      console.warn('⚠️ [BullMQ Worker] Connection warning:', err.message);
    });

    isStarted = true;
    console.log(`👷 BullMQ Background Worker active on queue "${NOTIFICATION_QUEUE_NAME}"`);
    return bullWorkerInstance;
  } catch (err: any) {
    console.warn('⚠️ Could not start BullMQ worker, continuing with embedded engine:', err.message);
    isStarted = true;
    return null;
  }
}

/**
 * Returns whether a worker (BullMQ or embedded fallback) is active.
 */
export function isWorkerActive(): boolean {
  return isStarted;
}

/**
 * Gracefully stops the BullMQ worker instance if active.
 */
export async function stopNotificationWorker(): Promise<void> {
  if (bullWorkerInstance) {
    try {
      await bullWorkerInstance.close();
      bullWorkerInstance = null;
      console.log('🛑 [NotificationWorker] BullMQ Worker gracefully closed');
    } catch (err: any) {
      console.warn('⚠️ [NotificationWorker] Error closing BullMQ worker:', err.message);
    }
  }
}

/**
 * Standalone worker entry point for separate worker process.
 */
export async function runStandaloneWorker(): Promise<void> {
  await startNotificationWorker();
  console.log('🚀 NotifyX Notification Worker running. Press Ctrl+C to stop.');

  process.on('SIGINT', async () => {
    await stopNotificationWorker();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stopNotificationWorker();
    process.exit(0);
  });
}

