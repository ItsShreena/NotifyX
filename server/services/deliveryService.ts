import { dbService } from './dbService.ts';
import { channelFactory } from '../channels/channelFactory.ts';
import type { ChannelName, NotificationPayload, RecipientInfo, ChannelDeliveryResult } from '../channels/types.ts';
import { selectCandidateChannels } from '../channels/channelPolicy.ts';
import { preferenceService, normalizeCategory } from './preferenceService.ts';

export interface DeliveryAttemptResult {
  channel: string;
  delivered: boolean;
  skipped: boolean;
  provider: string;
  statusCode: number;
  latencyMs: number;
  deliveryId?: string;
  reason?: string;
  error?: string;
}

export interface MultiChannelDeliverySummary {
  notificationId: string;
  channelsAttempted: ChannelName[];
  deliveredChannels: ChannelName[];
  skippedChannels: ChannelName[];
  failedChannels: ChannelName[];
  allSucceeded: boolean;
  hasFailures: boolean;
  results: DeliveryAttemptResult[];
}

export class DeliveryService {
  /**
   * Executes delivery for an individual channel using the ChannelFactory adapter.
   * Cleanly updates the database delivery record.
   */
  async deliverToChannel(params: {
    notificationId: string;
    recipientId: string;
    channel: string;
    title: string;
    message: string;
    priority: string;
    type: string;
    applicationId: string;
    applicationName?: string;
    appOwnerUserId?: string;
    metadata?: Record<string, unknown>;
    actionUrl?: string | null;
    aiProcessed?: boolean;
    aiCategory?: string | null;
    aiPriority?: string | null;
    aiSummary?: string | null;
    aiShouldGroup?: boolean;
    attemptNumber?: number;
  }): Promise<DeliveryAttemptResult> {
    const channelName = params.channel.toLowerCase() as ChannelName;
    const channelAdapter = channelFactory.getChannel(channelName);

    const notificationPayload: NotificationPayload = {
      id: params.notificationId,
      title: params.title,
      message: params.message,
      priority: params.priority,
      type: params.type,
      applicationId: params.applicationId,
      applicationName: params.applicationName,
      appOwnerUserId: params.appOwnerUserId,
      metadata: params.metadata,
      actionUrl: params.actionUrl,
      aiProcessed: params.aiProcessed,
      aiCategory: params.aiCategory,
      aiPriority: params.aiPriority,
      aiSummary: params.aiSummary,
      aiShouldGroup: params.aiShouldGroup,
    };

    const recipientInfo: RecipientInfo = {
      id: params.recipientId,
    };

    const result: ChannelDeliveryResult = await channelAdapter.send(notificationPayload, recipientInfo);

    // Authoritatively persist delivery state per channel
    await dbService.upsertChannelDelivery(params.notificationId, channelName, {
      status: result.delivered ? 'delivered' : 'failed',
      statusCode: result.statusCode,
      attempts: params.attemptNumber ?? 1,
      maxAttempts: 3,
      latencyMs: result.latencyMs,
      deliveredAt: result.deliveredAt || (result.delivered ? new Date() : null),
      failedAt: result.failedAt || (!result.delivered ? new Date() : null),
      errorMessage: result.error || null,
      provider: result.provider,
      responseBody: JSON.stringify({
        channel: channelName,
        provider: result.provider,
        delivered: result.delivered,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        details: result.details,
      }),
    });

    return {
      channel: channelName,
      delivered: result.delivered,
      skipped: false,
      provider: result.provider,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      error: result.error,
    };
  }

  /**
   * Records a channel as intentionally skipped due to user preference settings.
   * Does NOT invoke downstream transport.
   */
  async recordSkippedChannel(params: {
    notificationId: string;
    channel: string;
    category: string;
    reason: string;
  }): Promise<DeliveryAttemptResult> {
    const channelName = params.channel.toLowerCase() as ChannelName;

    console.log(
      `🛑 [DeliveryService] Skipped [${channelName.toUpperCase()}] for notification ${params.notificationId}: ${params.reason}`
    );

    await dbService.upsertChannelDelivery(params.notificationId, channelName, {
      status: 'skipped',
      statusCode: 403,
      attempts: 0,
      maxAttempts: 3,
      latencyMs: 1,
      errorMessage: `Skipped: ${params.reason}`,
      provider: 'NotifyX-PreferenceEngine',
      responseBody: JSON.stringify({
        skipped: true,
        reason: params.reason,
        category: params.category,
      }),
    });

    return {
      channel: channelName,
      delivered: false,
      skipped: true,
      provider: 'NotifyX-PreferenceEngine',
      reason: params.reason,
      statusCode: 403,
      latencyMs: 1,
    };
  }

  /**
   * Evaluates candidate channels for a notification (based on Priority Policy and explicit overrides),
   * checks user preferences per channel, and dispatches to allowed channel adapters.
   *
   * Idempotency guarantee:
   * During retries, already delivered or skipped channels are NOT re-sent.
   */
  async processMultiChannelDelivery(params: {
    notificationId: string;
    recipientId: string;
    title: string;
    message: string;
    priority: string;
    type: string;
    applicationId: string;
    applicationName?: string;
    appOwnerUserId?: string;
    metadata?: Record<string, unknown>;
    actionUrl?: string | null;
    aiProcessed?: boolean;
    aiCategory?: string | null;
    aiPriority?: string | null;
    aiSummary?: string | null;
    aiShouldGroup?: boolean;
    requestedChannel?: string;
    attemptNumber?: number;
    maxAttempts?: number;
  }): Promise<MultiChannelDeliverySummary> {
    const {
      notificationId,
      recipientId,
      priority,
      type,
      requestedChannel,
      appOwnerUserId,
      attemptNumber = 1,
    } = params;

    const normalizedCategory = normalizeCategory(params.aiCategory || type || 'system');
    const candidateChannels = selectCandidateChannels(priority, requestedChannel);

    console.log(
      `📡 [DeliveryService] Notification ${notificationId} (priority: ${priority}, category: ${normalizedCategory}) candidate channels: [${candidateChannels.join(', ')}]`
    );

    // Fetch existing delivery records for idempotency (e.g. during retries)
    const existingNotif = await dbService.getNotificationById(notificationId);
    let existingDeliveries = (existingNotif?.deliveries || []) as Array<{
      channel: string;
      status: string;
    }>;
    if (!existingDeliveries.length) {
      existingDeliveries = (await dbService.getDeliveriesByNotificationId(notificationId)) as Array<{
        channel: string;
        status: string;
      }>;
    }

    const deliveredChannels: ChannelName[] = [];
    const skippedChannels: ChannelName[] = [];
    const failedChannels: ChannelName[] = [];
    const results: DeliveryAttemptResult[] = [];

    for (const ch of candidateChannels) {
      const existingDel = existingDeliveries.find((d) => d.channel.toLowerCase() === ch.toLowerCase());

      // Idempotency: If this channel already succeeded in a prior attempt, skip re-delivering!
      if (existingDel && existingDel.status.toLowerCase() === 'delivered') {
        console.log(`ℹ️ [DeliveryService] Channel [${ch.toUpperCase()}] already delivered for ${notificationId}. Skipping duplicate delivery.`);
        deliveredChannels.push(ch);
        results.push({
          channel: ch,
          delivered: true,
          skipped: false,
          provider: 'NotifyX-ExistingDelivery',
          statusCode: 200,
          latencyMs: 0,
        });
        continue;
      }

      // If channel was intentionally skipped in preferences, never retry it
      if (existingDel && existingDel.status.toLowerCase() === 'skipped') {
        console.log(`ℹ️ [DeliveryService] Channel [${ch.toUpperCase()}] previously skipped for ${notificationId}. Retaining skipped state.`);
        skippedChannels.push(ch);
        results.push({
          channel: ch,
          delivered: false,
          skipped: true,
          provider: 'NotifyX-PreferenceEngine',
          statusCode: 403,
          latencyMs: 0,
          reason: 'Channel disabled in user preferences',
        });
        continue;
      }

      // Check recipient preference for this channel
      const prefCheck = await preferenceService.checkDeliveryAllowed(
        recipientId,
        normalizedCategory,
        ch,
        appOwnerUserId
      );

      if (!prefCheck.allowed) {
        const skippedRes = await this.recordSkippedChannel({
          notificationId,
          channel: ch,
          category: normalizedCategory,
          reason: prefCheck.reason || `Channel ${ch} disabled in settings`,
        });
        skippedChannels.push(ch);
        results.push(skippedRes);
        continue;
      }

      // Channel is approved by user preferences: Dispatch through channel adapter
      try {
        const deliveryRes = await this.deliverToChannel({
          ...params,
          channel: ch,
          attemptNumber,
        });

        if (deliveryRes.delivered) {
          deliveredChannels.push(ch);
        } else {
          failedChannels.push(ch);
        }
        results.push(deliveryRes);
      } catch (err: any) {
        console.warn(`⚠️ [DeliveryService] Delivery attempt failed for channel [${ch.toUpperCase()}]:`, err.message);
        await dbService.upsertChannelDelivery(notificationId, ch, {
          status: 'failed',
          statusCode: 500,
          attempts: attemptNumber,
          errorMessage: err.message || 'Delivery error',
          failedAt: new Date(),
        });

        failedChannels.push(ch);
        results.push({
          channel: ch,
          delivered: false,
          skipped: false,
          provider: 'ChannelError',
          statusCode: 500,
          latencyMs: 0,
          error: err.message,
        });
      }
    }

    const hasFailures = failedChannels.length > 0;
    const allSucceeded = !hasFailures;

    return {
      notificationId,
      channelsAttempted: candidateChannels,
      deliveredChannels,
      skippedChannels,
      failedChannels,
      allSucceeded,
      hasFailures,
      results,
    };
  }
}

export const deliveryService = new DeliveryService();
