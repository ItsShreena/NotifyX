import { dbService } from '../services/dbService.ts';
import { preferenceService, normalizeCategory } from '../services/preferenceService.ts';
import { deliveryService } from '../services/deliveryService.ts';
import { aiService } from '../services/aiService.ts';

export interface NotificationJobData {
  notificationId: string;
  recipientId: string;
  channel: string;
}

export interface JobExecutionResult {
  status: 'delivered' | 'skipped' | 'failed';
  channel?: string;
  reason?: string;
  category?: string;
  latencyMs?: number;
  isCritical?: boolean;
}

/**
 * Executes the authoritative notification delivery lifecycle:
 * 1. Read job data
 * 2. Load notification data from DB
 * 3. Perform AI Notification Intelligence (with safe fallback & cost control)
 * 4. Priority-Aware Channel Selection & User Preference Verification
 * 5. Multi-Channel Dispatch via Channel Adapters (In-App, Email, Push)
 * 6. Update delivery statuses & record attempts
 * 7. Handle retries with exponential backoff on transient failure
 */
export async function processNotificationJob(
  data: NotificationJobData,
  attemptNumber: number = 1,
  maxAttempts: number = 3
): Promise<JobExecutionResult> {
  const { notificationId, recipientId, channel } = data;
  const startMs = Date.now();

  console.log(
    `⚙️ [JobProcessor] Processing notification ${notificationId} (attempt ${attemptNumber} of ${maxAttempts})`
  );

  // STAGE 2: Load notification data
  const notification = await dbService.getNotificationById(notificationId);
  if (!notification) {
    throw new Error(`Notification ${notificationId} not found in database.`);
  }

  // STAGE 2.5: AI Notification Intelligence Analysis
  let currentNotification = notification;
  if (!notification.aiProcessed) {
    console.log(`🤖 [JobProcessor] Performing AI Notification Intelligence for notification ${notificationId}`);
    try {
      const aiResult = await aiService.analyzeNotification({
        title: notification.title,
        message: notification.message,
        type: notification.type,
        priority: notification.priority,
        metadata: (notification.metadata as any) || null,
      });

      console.log(
        `🧠 [JobProcessor] AI Result: category=${aiResult.category}, priority=${aiResult.finalPriority} (AI suggested: ${aiResult.aiSuggestedPriority}), summary="${aiResult.summary || 'none'}", shouldGroup=${aiResult.shouldGroup}`
      );

      const updated = await dbService.updateNotificationAiMetadata(notificationId, {
        aiCategory: aiResult.category,
        aiPriority: aiResult.priority,
        aiSummary: aiResult.summary,
        aiShouldGroup: aiResult.shouldGroup,
        finalPriority: aiResult.finalPriority,
        finalType: aiResult.finalCategory,
      });

      if (updated) {
        currentNotification = updated as any;
      }
    } catch (aiErr: any) {
      console.warn('⚠️ [JobProcessor] AI analysis error, continuing with fallback values:', aiErr.message);
    }
  }

  const category = normalizeCategory(currentNotification.type || currentNotification.aiCategory || 'SYSTEM');
  const finalPriority = currentNotification.priority || 'normal';
  const isCritical = finalPriority.toLowerCase() === 'critical';

  if (isCritical) {
    console.log(
      `🚨 [JobProcessor] Processing CRITICAL priority notification ${notificationId} (${category})`
    );
  }

  // Controlled failure simulation support:
  // [SIMULATE_FAIL]: fails once to test retry & backoff
  // [DEAD_LETTER]: fails all attempts to test dead-letter permanent failure
  const isDeadLetterTest =
    Boolean(currentNotification.metadata && (currentNotification.metadata as any).simulateDeadLetter) ||
    currentNotification.title.includes('[DEAD_LETTER]') ||
    currentNotification.title.includes('[PERMANENT_FAIL]');

  const isSimulatedFail =
    Boolean(currentNotification.metadata && (currentNotification.metadata as any).simulateFailure) ||
    currentNotification.title.includes('[SIMULATE_FAIL]');

  if (isDeadLetterTest) {
    console.warn(
      `💥 [JobProcessor] Simulating permanent failure on attempt ${attemptNumber} for Dead-Letter testing`
    );
    throw new Error(
      `Carrier HTTP 500: Downstream provider connection refused on attempt ${attemptNumber} (Dead-Letter queue test)`
    );
  }

  if (isSimulatedFail && attemptNumber < 2) {
    console.warn(
      `⚠️ [JobProcessor] Simulating transient network failure on attempt ${attemptNumber}`
    );
    throw new Error(
      `Transient carrier timeout on attempt ${attemptNumber} (will retry with exponential backoff)`
    );
  }

  // STAGE 3-5: Multi-Channel Selection, Preference Check, and Adapter Dispatch
  const requestedChannel =
    channel && channel !== 'multi' && channel !== 'all' && channel !== 'multi_channel'
      ? channel
      : undefined;

  const deliverySummary = await deliveryService.processMultiChannelDelivery({
    notificationId,
    recipientId,
    title: currentNotification.title,
    message: currentNotification.message,
    priority: finalPriority,
    type: category,
    applicationId: currentNotification.applicationId,
    applicationName: currentNotification.application?.name,
    appOwnerUserId: currentNotification.application?.userId,
    metadata: (currentNotification.metadata as any) || undefined,
    actionUrl: currentNotification.actionUrl,
    aiProcessed: currentNotification.aiProcessed,
    aiCategory: currentNotification.aiCategory,
    aiPriority: currentNotification.aiPriority,
    aiSummary: currentNotification.aiSummary,
    aiShouldGroup: currentNotification.aiShouldGroup,
    requestedChannel,
    attemptNumber,
    maxAttempts,
  });

  // If any enabled channel failed, throw error to trigger BullMQ retry (retrying only failed channels)
  if (deliverySummary.hasFailures) {
    const failedList = deliverySummary.failedChannels.join(', ');
    throw new Error(`Delivery failed for channel(s): [${failedList}] on attempt ${attemptNumber}`);
  }

  const wasCompletelySkipped =
    deliverySummary.deliveredChannels.length === 0 && deliverySummary.skippedChannels.length > 0;

  // Record delivery attempt outcome ('delivered' or 'skipped' due to preferences)
  await dbService.recordNotificationAttempt(notificationId, {
    attempt: attemptNumber,
    maxAttempts,
    status: wasCompletelySkipped ? 'skipped' : 'delivered',
    error: wasCompletelySkipped ? 'All requested channels disabled in preferences' : undefined,
  });

  const totalLatency = Date.now() - startMs;
  console.log(
    `✅ [JobProcessor] Successfully processed notification ${notificationId}: delivered [${deliverySummary.deliveredChannels.join(', ')}], skipped [${deliverySummary.skippedChannels.join(', ')}] in ${totalLatency}ms`
  );

  return {
    status: wasCompletelySkipped ? 'skipped' : 'delivered',
    channel: deliverySummary.deliveredChannels.join(', ') || 'none',
    latencyMs: totalLatency,
    isCritical,
  };
}

/**
 * Handles job failure, records retry timeline, or dead-letters on max attempts exhaustion.
 */
export async function handleJobFailure(
  jobId: string,
  data: NotificationJobData,
  err: Error,
  attemptsMade: number,
  maxAttempts: number = 3
): Promise<void> {
  const isExhausted = attemptsMade >= maxAttempts;
  const nextDelayMs = isExhausted ? 0 : Math.pow(2, attemptsMade - 1) * 1000;

  console.warn(
    `⚠️ [JobProcessor] Job #${jobId} retry scheduled (attempt ${attemptsMade}/${maxAttempts}): ${err.message}`
  );

  try {
    // Record this attempt in the notification retry history timeline
    await dbService.recordNotificationAttempt(data.notificationId, {
      attempt: attemptsMade,
      maxAttempts,
      error: err.message,
      delayMs: nextDelayMs,
      status: isExhausted ? 'failed' : 'retrying',
    });

    if (isExhausted) {
      console.info(
        `📦 [JobProcessor] Job #${jobId} exhausted all ${maxAttempts} retry attempts. Handled and recorded as Dead-Letter in database.`
      );
      await dbService.updateNotificationDeliveryStatus(data.notificationId, 'failed', {
        error: `[Dead-Letter] ${err.message}`,
        statusCode: 500,
        attempts: attemptsMade,
      });
    }
  } catch (dbErr) {
    console.error('Failed to record retry attempt or update delivery status in DB:', dbErr);
  }
}
