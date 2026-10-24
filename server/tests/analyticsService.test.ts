import assert from 'node:assert';
import { analyticsService } from '../services/analyticsService.ts';
import { dbService } from '../services/dbService.ts';

async function runAnalyticsTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING NOTIFYX ANALYTICS & MONITORING TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // Set up two distinct test developer accounts for testing isolation
  const userA = `user_analytics_a_${Date.now()}`;
  const userB = `user_analytics_b_${Date.now()}`;

  // Create applications for User A
  const { application: appA1 } = await dbService.createApplication({
    userId: userA,
    name: 'ShopKart Retail',
    description: 'E-commerce platform',
    environment: 'production',
  });

  const { application: appA2 } = await dbService.createApplication({
    userId: userA,
    name: 'TaskFlow PM',
    description: 'Project management app',
    environment: 'staging',
  });

  // Create an application for User B
  const { application: appB1 } = await dbService.createApplication({
    userId: userB,
    name: 'Secret App B',
    description: 'Isolated application',
    environment: 'production',
  });

  // Seed notifications for User A
  // 1. Delivered notification with low latency
  const notif1 = await dbService.createNotification({
    applicationId: appA1.id,
    recipientId: 'cust_01',
    title: 'Order Placed',
    message: 'Your order was placed successfully',
    type: 'ORDER',
    priority: 'normal',
    initialStatus: 'delivered',
  });

  await dbService.upsertChannelDelivery(notif1.id, 'in_app', {
    status: 'delivered',
    statusCode: 200,
    attempts: 1,
    latencyMs: 35,
    provider: 'InAppWebSocket',
  });

  // 2. Critical notification with multi-channel deliveries (In-App delivered, Email delivered, Push skipped)
  const notif2 = await dbService.createNotification({
    applicationId: appA1.id,
    recipientId: 'cust_02',
    title: 'Payment Failed',
    message: 'Your payment of ₹2,499 failed.',
    type: 'PAYMENT',
    priority: 'critical',
    initialStatus: 'delivered',
  });

  await dbService.updateNotificationAiMetadata(notif2.id, {
    aiCategory: 'PAYMENT',
    aiPriority: 'critical',
    aiSummary: 'Payment failed for ₹2,499',
    aiShouldGroup: false,
    finalPriority: 'critical',
    finalType: 'PAYMENT',
  });

  await dbService.upsertChannelDelivery(notif2.id, 'in_app', {
    status: 'delivered',
    statusCode: 200,
    attempts: 1,
    latencyMs: 25,
    provider: 'InAppWebSocket',
  });

  await dbService.upsertChannelDelivery(notif2.id, 'email', {
    status: 'delivered',
    statusCode: 200,
    attempts: 1,
    latencyMs: 120,
    provider: 'MockEmailProvider',
  });

  await dbService.upsertChannelDelivery(notif2.id, 'push', {
    status: 'skipped',
    statusCode: 403,
    attempts: 0,
    latencyMs: 1,
    provider: 'NotifyX-PreferenceEngine',
    errorMessage: 'Skipped: Push disabled in recipient preferences',
  });

  // 3. Failed notification after 3 retries (Dead-Letter)
  const notif3 = await dbService.createNotification({
    applicationId: appA2.id,
    recipientId: 'cust_03',
    title: 'Deployment Alert',
    message: 'Canary rollout error',
    type: 'DEPLOYMENT',
    priority: 'high',
    initialStatus: 'pending',
  });

  await dbService.recordNotificationAttempt(notif3.id, {
    attempt: 1,
    maxAttempts: 3,
    error: 'Provider timeout',
    delayMs: 1000,
    status: 'retrying',
  });
  await dbService.recordNotificationAttempt(notif3.id, {
    attempt: 2,
    maxAttempts: 3,
    error: 'Provider timeout',
    delayMs: 2000,
    status: 'retrying',
  });
  await dbService.recordNotificationAttempt(notif3.id, {
    attempt: 3,
    maxAttempts: 3,
    error: 'Carrier HTTP 500: Downstream provider connection refused',
    delayMs: 0,
    status: 'failed',
  });

  await dbService.upsertChannelDelivery(notif3.id, 'email', {
    status: 'failed',
    statusCode: 500,
    attempts: 3,
    latencyMs: 0,
    provider: 'MockEmailProvider',
    errorMessage: 'Carrier HTTP 500: Downstream provider connection refused',
  });

  // Seed notification for User B
  const notifB = await dbService.createNotification({
    applicationId: appB1.id,
    recipientId: 'user_b_cust',
    title: 'User B Confidential Event',
    message: 'Data for User B only',
    type: 'SECURITY',
    priority: 'critical',
    initialStatus: 'delivered',
  });
  await dbService.upsertChannelDelivery(notifB.id, 'in_app', {
    status: 'delivered',
    statusCode: 200,
    attempts: 1,
    latencyMs: 15,
  });

  // TEST 1: Overview calculation with real data
  await test('1. Overview calculates total notifications, delivery status counts, and success rate', async () => {
    const overview = await analyticsService.getOverview(userA, '7d');

    assert.strictEqual(overview.totalNotifications, 3, 'User A has exactly 3 notifications');
    assert.strictEqual(overview.delivered, 2, '2 delivered notifications');
    assert.strictEqual(overview.failed, 1, '1 failed notification');
    assert.strictEqual(overview.skipped, 1, '1 skipped delivery recorded');
    assert(overview.successRate >= 66 && overview.successRate <= 67, 'Success rate is ~66.7%');
    assert(overview.totalRetries >= 2, 'Total retries counted from attempt history');
    assert(typeof overview.averageDeliveryTimeMs === 'number', 'Average latency calculated in ms');
    assert(typeof overview.averageDeliveryTimeSec === 'number', 'Average latency calculated in sec');
  });

  // TEST 2: Notification Timeline buckets
  await test('2. Timeline groups notifications into discrete time intervals', async () => {
    const timeline24h = await analyticsService.getNotificationTimeline(userA, '24h');
    assert.strictEqual(timeline24h.timeline.length, 24, '24h range creates 24 hourly buckets');

    const timeline7d = await analyticsService.getNotificationTimeline(userA, '7d');
    assert.strictEqual(timeline7d.timeline.length, 7, '7d range creates 7 daily buckets');

    const totalCreatedInTimeline = timeline7d.timeline.reduce((sum, b) => sum + b.created, 0);
    assert.strictEqual(totalCreatedInTimeline, 3, 'Timeline accounts for all 3 notifications');
  });

  // TEST 3: Delivery Analytics breakdown
  await test('3. Delivery analytics aggregates NotificationDelivery records', async () => {
    const delivery = await analyticsService.getDeliveryAnalytics(userA, '7d');

    assert.strictEqual(delivery.totalDeliveries, 6, '6 deliveries total');
    assert.strictEqual(delivery.delivered, 3, '3 deliveries marked delivered');
    assert.strictEqual(delivery.failed, 1, '1 delivery marked failed');
    assert.strictEqual(delivery.skipped, 1, '1 delivery marked skipped');
    assert.strictEqual(delivery.pending, 1, '1 delivery pending');
    assert(delivery.successPercentage > 0, 'Success percentage calculated');
  });

  // TEST 4: Channel Analytics & Performance
  await test('4. Channel analytics calculates metrics per channel (In-App, Email, Push)', async () => {
    const channelData = await analyticsService.getChannelAnalytics(userA, '7d');
    assert.strictEqual(channelData.channels.length, 3, 'Reports on In-App, Email, and Push');

    const inApp = channelData.channels.find((c) => c.channel === 'in_app');
    assert(inApp !== undefined, 'In-App channel reported');
    assert.strictEqual(inApp!.delivered, 2, '2 In-App deliveries delivered');
    assert.strictEqual(inApp!.failed, 0, '0 In-App failures');
    assert.strictEqual(inApp!.successRate, 100, '100% In-App success rate');

    const email = channelData.channels.find((c) => c.channel === 'email');
    assert(email !== undefined, 'Email channel reported');
    assert.strictEqual(email!.delivered, 1, '1 Email delivered');
    assert.strictEqual(email!.failed, 1, '1 Email failed');
    assert.strictEqual(email!.successRate, 50, '50% Email success rate');

    const push = channelData.channels.find((c) => c.channel === 'push');
    assert(push !== undefined, 'Push channel reported');
    assert.strictEqual(push!.skipped, 1, '1 Push skipped');
  });

  // TEST 5: Delivery Latency (Average, Fastest, Slowest, Channel)
  await test('5. Delivery latency benchmarks calculate real latency and handle missing timestamps', async () => {
    const latency = await analyticsService.getDeliveryLatency(userA, '7d');

    assert(latency.averageLatencyMs > 0, 'Average latency is positive');
    assert(latency.fastestDeliveryMs <= latency.averageLatencyMs, 'Fastest is <= average');
    assert(latency.slowestDeliveryMs >= latency.averageLatencyMs, 'Slowest is >= average');
    assert(typeof latency.byChannel.inApp.latencyMs === 'number', 'In-App latency calculated');
    assert(typeof latency.byChannel.email.latencyMs === 'number', 'Email latency calculated');
  });

  // TEST 6: Retry Analytics & Dead-Letter Tracking
  await test('6. Retry analytics tracks retry counts, average attempts, and dead-letter count', async () => {
    const retries = await analyticsService.getRetryAnalytics(userA, '7d');

    assert(retries.totalRetryAttempts >= 2, 'Total retries calculated from attempt history');
    assert.strictEqual(retries.notificationsRetried, 1, '1 notification experienced retries');
    assert.strictEqual(retries.deadLetterCount, 1, '1 notification dead-lettered after 3 attempts');
    assert(retries.mostRetried.length >= 1, 'Most retried list populated');
    assert.strictEqual(retries.mostRetried[0].attempts, 3, 'Top retried notification had 3 attempts');
  });

  // TEST 7: Failure Analytics with Categorized Reasons
  await test('7. Failure analytics groups failed deliveries by error category', async () => {
    const failureData = await analyticsService.getFailureAnalytics(userA, '7d');

    assert.strictEqual(failureData.totalFailures, 1, '1 failure recorded');
    const connError = failureData.failureReasons.find((r) => r.reason.includes('Connection error'));
    assert(connError && connError.count === 1, 'Categorized as Connection error');
  });

  // TEST 8: AI Analytics & Intelligence Performance
  await test('8. AI analytics calculates processed count, category, and priority distribution', async () => {
    const ai = await analyticsService.getAIAnalytics(userA, '7d');

    assert.strictEqual(ai.aiProcessed, 1, '1 notification processed by AI');
    assert.strictEqual(ai.mostCommonCategory, 'PAYMENT', 'Most common category is PAYMENT');
    assert.strictEqual(ai.mostCommonPriority, 'CRITICAL', 'Most common priority is CRITICAL');
    assert.strictEqual(ai.categories['PAYMENT'], 1, 'PAYMENT count is 1');
  });

  // TEST 9: Application-Level Usage & Channel Distribution
  await test('9. Application analytics isolates metrics by application', async () => {
    const appAnalytics = await analyticsService.getApplicationAnalytics(userA, '7d');

    assert.strictEqual(appAnalytics.applications.length, 2, 'User A owns 2 applications');
    const shopKart = appAnalytics.applications.find((a) => a.name === 'ShopKart Retail');
    assert(shopKart !== undefined, 'ShopKart application found');
    assert.strictEqual(shopKart!.notificationsCreated, 2, 'ShopKart sent 2 notifications');
    assert.strictEqual(shopKart!.successRate, 100, 'ShopKart has 100% success rate');

    const taskFlow = appAnalytics.applications.find((a) => a.name === 'TaskFlow PM');
    assert(taskFlow !== undefined, 'TaskFlow application found');
    assert.strictEqual(taskFlow!.notificationsCreated, 1, 'TaskFlow sent 1 notification');
    assert.strictEqual(taskFlow!.failedDeliveriesCount, 1, 'TaskFlow recorded 1 failed delivery');
  });

  // TEST 10: Cross-User Ownership & Data Isolation
  await test('10. Multi-tenant isolation: User A cannot see User B notifications or applications', async () => {
    const overviewA = await analyticsService.getOverview(userA, '7d');
    const overviewB = await analyticsService.getOverview(userB, '7d');

    assert.strictEqual(overviewA.totalNotifications, 3, 'User A sees only their 3 notifications');
    assert.strictEqual(overviewB.totalNotifications, 1, 'User B sees only their 1 notification');

    const appsA = await analyticsService.getApplicationAnalytics(userA, '7d');
    const appsB = await analyticsService.getApplicationAnalytics(userB, '7d');

    assert(!appsA.applications.some((a) => a.name === 'Secret App B'), 'User A cannot see User B apps');
    assert(appsB.applications.some((a) => a.name === 'Secret App B'), 'User B sees their own app');
  });

  // TEST 11: Empty Datasets Graceful Fallback
  await test('11. Returns meaningful empty state when user has zero notifications', async () => {
    const emptyUser = `user_empty_${Date.now()}`;
    const overview = await analyticsService.getOverview(emptyUser, '7d');

    assert.strictEqual(overview.totalNotifications, 0, 'Zero notifications');
    assert.strictEqual(overview.delivered, 0, 'Zero delivered');
    assert.strictEqual(overview.failed, 0, 'Zero failed');
    assert.strictEqual(overview.successRate, 100, 'Success rate defaults cleanly to 100%');

    const ai = await analyticsService.getAIAnalytics(emptyUser, '7d');
    assert.strictEqual(ai.aiProcessed, 0, 'Zero AI processed');
    assert.strictEqual(ai.mostCommonCategory, 'None', 'Category is None on empty dataset');
  });

  // TEST 12: Queue & System Health Monitoring
  await test('12. Queue monitoring and system health provide real component statuses', async () => {
    const queue = await analyticsService.getQueueAnalytics();
    assert.strictEqual(queue.workerStatus, 'ONLINE', 'Worker status is ONLINE');
    assert(typeof queue.waiting === 'number', 'Waiting count is a number');

    const health = await analyticsService.getHealth();
    assert(health.status === 'healthy' || health.status === 'degraded', 'Health status is valid');
    assert.strictEqual(health.components.api.status, 'healthy', 'API is healthy');
    assert.strictEqual(health.components.worker.status, 'healthy', 'Worker is healthy');
  });

  // TEST 13: Recent Activity Chronological Feed
  await test('13. Recent activity returns chronological event log', async () => {
    const activity = await analyticsService.getRecentActivity(userA, 10);
    assert(activity.activities.length > 0, 'Recent activity items returned');
    assert(activity.activities.some((a) => a.type === 'created'), 'Notification queued activity exists');
    assert(activity.activities.some((a) => a.type === 'delivered'), 'Delivered activity exists');
  });

  console.log('\n======================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runAnalyticsTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
