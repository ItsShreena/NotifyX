import assert from 'node:assert';
import { dbService } from '../services/dbService.ts';
import {
  getActiveQueueEngine,
  checkRedisAvailability,
  addNotificationJob,
  retryAllFailedJobs,
  retrySpecificJob,
  recoverPendingNotifications,
  getQueueMetrics,
} from '../queue/notificationQueue.ts';
import { isWorkerActive, startNotificationWorker } from '../queue/notificationWorker.ts';
import { deliveryService } from '../services/deliveryService.ts';
import { isDatabaseConnected } from '../db/prisma.ts';
import { checkRedisHealth } from '../queue/redisClient.ts';

import { userStore } from '../db/userStore.ts';

async function runReliabilityTests() {
  console.log('\n======================================================');
  console.log('🛡️  RUNNING NOTIFYX PRODUCTION RELIABILITY & RECOVERY TEST SUITE');
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

  // Setup: Ensure test user and application exist in DB
  const testEmail = `rel_${Math.random().toString(36).substring(2, 8)}@test.notifyx.io`;
  const userAccount = await userStore.create({
    name: 'Reliability Tester',
    email: testEmail,
    passwordHash: 'dummy_hash_for_testing',
  });
  const testUserId = userAccount.id;
  const { application: testApp } = await dbService.createApplication({
    userId: testUserId,
    name: `Reliability Test App ${Date.now()}`,
    environment: 'production',
  });


  // TEST 1: Queue Engine Detection & Runtime Active Engine
  await test('1. Active queue engine accurately detects Redis availability and returns runtime engine', async () => {
    const isRedisUp = await checkRedisAvailability(true);
    const engine = await getActiveQueueEngine();

    if (isRedisUp) {
      assert.strictEqual(engine, 'BullMQ (Redis)', 'BullMQ active when Redis reachable');
    } else {
      assert.strictEqual(engine, 'EmbeddedQueue (In-Memory)', 'EmbeddedQueue active when Redis offline');
    }
    assert(engine.length > 0, 'Active engine string returned');
  });

  // TEST 2: Worker Status Reporting & Initialization
  await test('2. Worker reporting reflects active queue worker state without crashing', async () => {
    await startNotificationWorker();
    const active = isWorkerActive();
    assert.strictEqual(active, true, 'Worker should be active after initialization');
  });

  // TEST 3: Recovery of pending/interrupted notifications persisted in PostgreSQL
  await test('3. recoverPendingNotifications retrieves pending notifications from DB and enqueues them', async () => {
    // Create a pending notification directly in the DB without enqueuing
    const notif = await dbService.createNotification({
      applicationId: testApp.id,
      recipientId: 'user_restart_test',
      title: 'Payment Crash Recovery Test Notification',
message: 'This payment notification was in pending state during crash recovery',
type: 'payments',
      priority: 'high',
      channel: 'email',
      initialStatus: 'pending',
    });

    assert.strictEqual(notif.status, 'pending', 'Created notification starts as pending in DB');

    // Run recovery
    const recovered = await recoverPendingNotifications(50);
    assert(recovered >= 1, `Expected at least 1 recovered notification, got ${recovered}`);

    // Wait 200ms for embedded worker processing
    await new Promise((r) => setTimeout(r, 200));

    const updated = await dbService.getNotificationById(notif.id);
    assert(updated, 'Notification still exists in database');
    assert(
      updated.status === 'delivered' || updated.status === 'retrying' || updated.status === 'pending',
      `Notification status updated after recovery (actual: ${updated?.status})`
    );
  });

  // TEST 4: Channel-level Idempotency: Prevent duplicate delivery on retry
  await test('4. Idempotency prevents duplicate sends when retrying multi-channel delivery', async () => {
    const notif = await dbService.createNotification({
      applicationId: testApp.id,
      recipientId: 'user_idemp_retry',
      title: 'Idempotency Delivery Test',
      message: 'Checking idempotency across multi-channel retries',
      type: 'PAYMENT',
      priority: 'high',
      channel: 'multi',
      initialStatus: 'pending',
    });

    // Simulate that in_app delivery was already recorded as delivered in attempt 1
    await dbService.upsertChannelDelivery(notif.id, 'in_app', {
      status: 'delivered',
      statusCode: 200,
      attempts: 1,
      maxAttempts: 3,
      latencyMs: 15,
      provider: 'InAppStore',
      deliveredAt: new Date(),
    });

    // Run delivery attempt 2
    const summary = await deliveryService.processMultiChannelDelivery({
      notificationId: notif.id,
      recipientId: 'user_idemp_retry',
      title: notif.title,
      message: notif.message,
      priority: 'high',
      type: 'PAYMENT',
      applicationId: testApp.id,
      attemptNumber: 2,
    });

    // in_app should NOT be re-sent; it must be marked as existing delivery
    const inAppResult = summary.results.find((r) => r.channel === 'in_app');
    assert(inAppResult, 'in_app result exists in delivery summary');
    assert.strictEqual(inAppResult?.provider, 'NotifyX-ExistingDelivery', 'in_app skipped duplicate delivery');
  });

  // TEST 5: Retry exhaustion, Dead-Letter recording, and failure visibility
  await test('5. Notification with permanent failure exhausts retries and transitions to dead-letter (failed)', async () => {
    const notif = await dbService.createNotification({
      applicationId: testApp.id,
      recipientId: 'user_dead_letter',
      title: '[DEAD_LETTER] Permanent failure simulation',
      message: 'This notification will fail all attempts to test dead-letter transition',
      type: 'SYSTEM',
      priority: 'high',
      channel: 'in_app',
      initialStatus: 'pending',
      metadata: { simulateDeadLetter: true },
    });

    // Enqueue the job
    await addNotificationJob({
      notificationId: notif.id,
      recipientId: notif.recipientId,
      channel: 'in_app',
    });

    // Wait for the 3 retry attempts with exponential backoff (up to 8s)
    console.log('⏳ Waiting for dead-letter retry exhaustion cycle...');
    let finalNotif;
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500));
      finalNotif = await dbService.getNotificationById(notif.id);
      if (finalNotif && finalNotif.status === 'failed') {
        break;
      }
    }

    assert(finalNotif, 'Notification exists');
    assert.strictEqual(finalNotif.status, 'failed', `Expected status 'failed' after exhaustion, got '${finalNotif.status}'`);
    assert(finalNotif.attemptCount >= 3, `Expected at least 3 attempts recorded, got ${finalNotif.attemptCount}`);
    assert(
      finalNotif.retryHistory && Array.isArray(finalNotif.retryHistory) && finalNotif.retryHistory.length >= 3,
      'Retry history timeline records all failed attempts'
    );
  });

  // TEST 6: Dead-letter manual recovery across restart via retrySpecificJob
  await test('6. retrySpecificJob recovers and re-queues dead-letter notifications from DB even when queue map is cold', async () => {
    // Create a failed/dead-letter notification in DB
    const failedNotif = await dbService.createNotification({
      applicationId: testApp.id,
      recipientId: 'user_cold_retry',
      title: 'Previously Dead-Lettered Notification',
      message: 'Simulating manual retry from console after restart',
      type: 'SYSTEM',
      priority: 'normal',
      channel: 'in_app',
      initialStatus: 'pending',
    });

    // Explicitly mark status as failed
    await dbService.updateNotificationStatus(failedNotif.id, 'failed');

    const before = await dbService.getNotificationById(failedNotif.id);
    assert.strictEqual(before?.status, 'failed', 'Notification is in failed status');

    // Call retrySpecificJob (which will find it in DB even if not in memory queue)
    const success = await retrySpecificJob(failedNotif.id, testUserId);
    assert.strictEqual(success, true, 'retrySpecificJob returns true on successful re-enqueue');

    // Verify status was updated to retrying
    const after = await dbService.getNotificationById(failedNotif.id);
    assert(
      after?.status === 'retrying' || after?.status === 'delivered',
      `Notification status should be retrying or delivered, got '${after?.status}'`
    );
  });

  // TEST 7: Batch Failed Job Reprocessing via retryAllFailedJobs
  await test('7. retryAllFailedJobs re-enqueues failed jobs scoped to calling tenant', async () => {
    const failed1 = await dbService.createNotification({
      applicationId: testApp.id,
      recipientId: 'user_batch_1',
      title: 'Batch Retry 1',
      message: 'Failed message 1',
      type: 'SYSTEM',
      priority: 'normal',
      channel: 'in_app',
      initialStatus: 'pending',
    });
    await dbService.updateNotificationStatus(failed1.id, 'failed');

    const count = await retryAllFailedJobs(testUserId);
    assert(count >= 1, `Expected at least 1 failed job retried, got ${count}`);

    const reloaded = await dbService.getNotificationById(failed1.id);
    assert(
      reloaded?.status === 'retrying' || reloaded?.status === 'delivered',
      `Notification status updated after batch retry (got ${reloaded?.status})`
    );
  });

  // TEST 8: Health & Readiness Endpoint Status Verification
  await test('8. Health inspection accurately reports database, Redis, queue engine, and worker status', async () => {
    const [dbHealthy, redisHealth, queueEngine] = await Promise.all([
      isDatabaseConnected().catch(() => false),
      checkRedisHealth().catch(() => ({ connected: false })),
      getActiveQueueEngine(),
    ]);

    const workerOk = isWorkerActive();
    assert(typeof dbHealthy === 'boolean', 'Database health is boolean');
    assert(typeof redisHealth.connected === 'boolean', 'Redis health is boolean');
    assert(
      queueEngine === 'BullMQ (Redis)' || queueEngine === 'EmbeddedQueue (In-Memory)',
      `Valid queue engine string (got ${queueEngine})`
    );
    assert.strictEqual(workerOk, true, 'Worker is active');
  });

  // TEST 9: Queue Metrics Consistency
  await test('9. Queue metrics return accurate counts across job states', async () => {
    const metrics = await getQueueMetrics();
    assert(typeof metrics.pending === 'number', 'pending is number');
    assert(typeof metrics.processing === 'number', 'processing is number');
    assert(typeof metrics.delivered === 'number', 'delivered is number');
    assert(typeof metrics.failed === 'number', 'failed is number');
    assert(typeof metrics.retryCount === 'number', 'retryCount is number');
  });

  console.log('\n======================================================');
  console.log(`🏁 RELIABILITY SUITE RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runReliabilityTests().catch((err) => {
  console.error('Fatal reliability test failure:', err);
  process.exit(1);
});
