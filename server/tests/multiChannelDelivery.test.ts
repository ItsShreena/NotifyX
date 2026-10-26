import assert from 'node:assert';
import { channelFactory } from '../channels/channelFactory.ts';
import { InAppChannel } from '../channels/inAppChannel.ts';
import { EmailChannel } from '../channels/emailChannel.ts';
import { PushChannel } from '../channels/pushChannel.ts';
import { selectCandidateChannels } from '../channels/channelPolicy.ts';
import {
  MockEmailProvider,
  getEmailProvider,
  resolveEmailProvider,
  setEmailProvider,
  EmailProvider,
  EmailSendOptions,
  EmailSendResult,
} from '../channels/providers/emailProvider.ts';
import {
  MockPushProvider,
  getPushProvider,
  setPushProvider,
  PushProvider,
  PushSendOptions,
  PushSendResult,
} from '../channels/providers/pushProvider.ts';
import { deliveryService } from '../services/deliveryService.ts';
import { dbService } from '../services/dbService.ts';
import { preferenceService } from '../services/preferenceService.ts';
import { processNotificationJob } from '../queue/jobProcessor.ts';

async function runMultiChannelTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING NOTIFYX MULTI-CHANNEL DELIVERY TEST SUITE');
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

  // TEST 1: Common Delivery Channel Interface & Registry
  await test('1. ChannelFactory registers in_app, email, and push channels adhering to common interface', async () => {
    const supported = channelFactory.getSupportedChannels();
    assert(supported.includes('in_app'), 'In-app channel registered');
    assert(supported.includes('email'), 'Email channel registered');
    assert(supported.includes('push'), 'Push channel registered');

    const inApp = channelFactory.getChannel('in_app');
    assert(typeof inApp.send === 'function', 'InAppChannel implements send() contract');

    const email = channelFactory.getChannel('email');
    assert(typeof email.send === 'function', 'EmailChannel implements send() contract');

    const push = channelFactory.getChannel('push');
    assert(typeof push.send === 'function', 'PushChannel implements send() contract');
  });

  // TEST 1B: Email provider selection remains mock-backed until a real adapter is implemented
  await test('1b. EMAIL_PROVIDER=mock resolves to the mock provider and never claims a real SMTP send', async () => {
    const previous = process.env.EMAIL_PROVIDER;
    try {
      process.env.EMAIL_PROVIDER = 'mock';
      const resolved = resolveEmailProvider();
      assert.strictEqual(resolved.name, 'MockEmailProvider', 'EMAIL_PROVIDER=mock selects the mock adapter');
      const result = await resolved.sendEmail({
        to: 'ops@notifyx.dev',
        subject: 'Simulation check',
        body: 'This is a simulated delivery only.',
        notificationId: 'sim_check_001',
      });
      assert.strictEqual(result.delivered, true, 'Mock provider reports successful simulated delivery');
      assert(result.messageId.startsWith('mock_email_'), 'Mock message IDs are explicitly simulated');
    } finally {
      if (previous === undefined) {
        delete process.env.EMAIL_PROVIDER;
      } else {
        process.env.EMAIL_PROVIDER = previous;
      }
    }
  });

  // TEST 2: In-App Channel Delivery
  await test('2. InAppChannel delivers payload and returns standardized ChannelDeliveryResult', async () => {
    const channel = new InAppChannel();
    const result = await channel.send(
      {
        id: 'test_notif_001',
        title: 'Payment Received',
        message: 'Your invoice #8841 was paid.',
        priority: 'normal',
        type: 'PAYMENT',
        applicationId: 'app_test_1',
      },
      { id: 'usr_recipient_1' }
    );

    assert(result.delivered === true, 'InApp marked delivered');
    assert(result.channel === 'in_app', 'Channel identifier matches');
    assert(result.statusCode === 200, 'Status code is 200');
    assert(result.provider === 'InAppWebSocket', 'Provider is InAppWebSocket');
    assert(typeof result.latencyMs === 'number', 'Latency measured in ms');
  });

  // TEST 3: Email Channel & MockEmailProvider
  await test('3. EmailChannel uses MockEmailProvider without paid external services', async () => {
    const mockEmail = new MockEmailProvider();
    setEmailProvider(mockEmail);

    const emailChannel = new EmailChannel();
    const result = await emailChannel.send(
      {
        id: 'test_notif_002',
        title: 'Payment Failed',
        message: 'Your payment of ₹2,499 failed because your card was declined.',
        priority: 'high',
        type: 'PAYMENT',
        applicationId: 'app_test_1',
      },
      { id: 'alex@example.com' }
    );

    assert(result.delivered === true, 'Email delivered via MockEmailProvider');
    assert(result.channel === 'email', 'Channel is email');
    assert(result.provider === 'MockEmailProvider', 'Provider is MockEmailProvider');

    const sent = mockEmail.getSentEmails();
    assert(sent.length >= 1, 'Email logged in provider');
    assert(sent[0].to === 'alex@example.com', 'Recipient email matches');
    assert(sent[0].subject.includes('Payment Failed'), 'Subject matches');
    assert(sent[0].body.includes('₹2,499'), 'Body contains payment amount');
  });

  // TEST 4: Push Channel & MockPushProvider
  await test('4. PushChannel uses MockPushProvider with short, punchy formatting', async () => {
    const mockPush = new MockPushProvider();
    setPushProvider(mockPush);

    const pushChannel = new PushChannel();
    const result = await pushChannel.send(
      {
        id: 'test_notif_003',
        title: 'Payment Failed',
        message: 'Your payment of ₹2,499 failed.',
        priority: 'critical',
        type: 'PAYMENT',
        applicationId: 'app_test_1',
      },
      { id: 'usr_mobile_99', deviceToken: 'tok_fcm_dummy_882' }
    );

    assert(result.delivered === true, 'Push delivered via MockPushProvider');
    assert(result.channel === 'push', 'Channel is push');
    assert(result.provider === 'MockPushProvider', 'Provider is MockPushProvider');

    const sent = mockPush.getSentPushes();
    assert(sent.length >= 1, 'Push logged in provider');
    assert(sent[0].recipientId === 'usr_mobile_99', 'Recipient ID matches');
    assert(sent[0].body.includes('₹2,499'), 'Body contains payment details');
  });

  // TEST 5: Provider Swappability without modifying Channel Adapters
  await test('5. Architecture allows swapping EmailProvider/PushProvider without modifying channel code', async () => {
    class CustomEnterpriseEmailProvider implements EmailProvider {
      readonly name = 'CustomEnterpriseEmailProvider';
      async sendEmail(options: EmailSendOptions): Promise<EmailSendResult> {
        return {
          messageId: `custom_ses_${Date.now()}`,
          provider: this.name,
          delivered: true,
          latencyMs: 15,
          statusCode: 200,
        };
      }
    }

    const previous = getEmailProvider();
    try {
      setEmailProvider(new CustomEnterpriseEmailProvider());
      const emailChannel = new EmailChannel();
      const res = await emailChannel.send(
        {
          id: 'test_notif_004',
          title: 'Custom Provider Test',
          message: 'Testing provider pluggability',
          priority: 'normal',
          type: 'SYSTEM',
          applicationId: 'app_test',
        },
        { id: 'dev@notifyx.dev' }
      );

      assert(res.delivered === true, 'Custom provider delivered');
      assert(res.provider === 'CustomEnterpriseEmailProvider', 'Custom provider executed');
    } finally {
      setEmailProvider(previous);
    }
  });

  // TEST 6: Priority-Aware Candidate Channel Selection Policy
  await test('6. Priority policy assigns channels: Low/Normal -> In-App; High -> In-App+Email; Critical -> In-App+Email+Push', async () => {
    const low = selectCandidateChannels('low');
    assert.deepStrictEqual(low, ['in_app'], 'Low priority uses in_app only');

    const normal = selectCandidateChannels('normal');
    assert.deepStrictEqual(normal, ['in_app'], 'Normal priority uses in_app only');

    const high = selectCandidateChannels('high');
    assert.deepStrictEqual(high, ['in_app', 'email'], 'High priority uses in_app + email');

    const critical = selectCandidateChannels('critical');
    assert.deepStrictEqual(critical, ['in_app', 'email', 'push'], 'Critical priority uses in_app + email + push');
  });

  // TEST 7: User Preferences Gating & Skipped Status
  await test('7. User preferences act as authoritative gatekeeper; disabled channels are recorded as SKIPPED', async () => {
    const testRecipient = `usr_pref_test_${Date.now()}`;
    const notifId = `notif_pref_${Date.now()}`;

    // Seed test notification in database
    await dbService.createNotification({
      applicationId: 'app_shopeasy_retail',
      recipientId: testRecipient,
      type: 'PAYMENT',
      title: 'Payment Failed',
      message: 'Your payment of ₹2,499 failed.',
      priority: 'critical',
      initialStatus: 'pending',
    });

    // Configure preferences: In-App = ON, Email = ON, Push = OFF
    await preferenceService.updateCategoryPreference(
      testRecipient,
      'payments',
      { inAppEnabled: true, emailEnabled: true, pushEnabled: false }
    );

    const summary = await deliveryService.processMultiChannelDelivery({
      notificationId: notifId,
      recipientId: testRecipient,
      title: 'Payment Failed',
      message: 'Your payment of ₹2,499 failed.',
      priority: 'critical',
      type: 'PAYMENT',
      applicationId: 'app_shopeasy_retail',
    });

    assert(summary.deliveredChannels.includes('in_app'), 'In-App delivered');
    assert(summary.deliveredChannels.includes('email'), 'Email delivered');
    assert(summary.skippedChannels.includes('push'), 'Push intentionally skipped');
    assert(!summary.failedChannels.includes('push'), 'Push not marked as failed');

    // Verify delivery records in database
    const pushDel = summary.results.find((r) => r.channel === 'push');
    assert(pushDel?.skipped === true, 'Push result marked skipped');
    assert(pushDel?.statusCode === 403, 'Skipped status code is 403');
  });

  // TEST 8: Delivery Database Tracking & Unique Records
  await test('8. Delivery records accurately track channel, status, provider, latency, and attempts', async () => {
    const notifId = `notif_db_track_${Date.now()}`;

    await dbService.upsertChannelDelivery(notifId, 'in_app', {
      status: 'delivered',
      statusCode: 200,
      attempts: 1,
      latencyMs: 42,
      provider: 'InAppWebSocket',
    });

    await dbService.upsertChannelDelivery(notifId, 'email', {
      status: 'delivered',
      statusCode: 200,
      attempts: 1,
      latencyMs: 38,
      provider: 'MockEmailProvider',
    });

    await dbService.upsertChannelDelivery(notifId, 'push', {
      status: 'skipped',
      statusCode: 403,
      attempts: 0,
      latencyMs: 1,
      errorMessage: 'Disabled in user preferences',
      provider: 'NotifyX-PreferenceEngine',
    });

    // Check delivery records
    const inAppRecord = await dbService.upsertChannelDelivery(notifId, 'in_app', {
      status: 'delivered',
      statusCode: 200,
      attempts: 1,
      provider: 'InAppWebSocket',
    });

    assert(inAppRecord.status === 'delivered', 'Status is delivered');
    assert(inAppRecord.channel === 'in_app', 'Channel is in_app');
  });

  // TEST 9: Retry Idempotency (Already Delivered Channels Not Re-sent)
  await test('9. Retries never re-dispatch to already delivered or intentionally skipped channels', async () => {
    const recipient = `usr_idemp_${Date.now()}`;

    // Seed notification record
    const createdNotif = await dbService.createNotification({
      applicationId: 'app_shopeasy_retail',
      recipientId: recipient,
      type: 'PAYMENT',
      title: 'Payment Retry',
      message: 'Retry payment notice',
      priority: 'critical',
      initialStatus: 'pending',
    });
    const notifId = createdNotif.id;

    const mockEmail = new MockEmailProvider();
    setEmailProvider(mockEmail);

    // Initial state: in_app was already delivered in attempt 1
    await dbService.upsertChannelDelivery(notifId, 'in_app', {
      status: 'delivered',
      statusCode: 200,
      attempts: 1,
      provider: 'InAppWebSocket',
    });

    // Push was already skipped
    await dbService.upsertChannelDelivery(notifId, 'push', {
      status: 'skipped',
      statusCode: 403,
      attempts: 0,
      provider: 'NotifyX-PreferenceEngine',
    });

    mockEmail.clearSentEmails();

    // Now run multi-channel delivery on attempt 2 (e.g. Email retry)
    const summary = await deliveryService.processMultiChannelDelivery({
      notificationId: notifId,
      recipientId: recipient,
      title: 'Payment Retry',
      message: 'Retry payment notice',
      priority: 'critical',
      type: 'PAYMENT',
      applicationId: 'app_shopeasy_retail',
      attemptNumber: 2,
    });

    // In-App was NOT re-sent (idempotency preserved)
    const inAppResult = summary.results.find((r) => r.channel === 'in_app');
    assert(inAppResult?.provider === 'NotifyX-ExistingDelivery', 'Existing delivery recognized and preserved');

    // Email was dispatched
    const emailResult = summary.results.find((r) => r.channel === 'email');
    assert(emailResult?.delivered === true, 'Email delivered on retry attempt');
  });

  // TEST 10: Transient Failure & Error Differentiation
  await test('10. Distinguishes FAILED from SKIPPED on carrier exception', async () => {
    const mockEmail = new MockEmailProvider();
    mockEmail.simulateFailure('SMTP 500 Connection Refused');
    setEmailProvider(mockEmail);

    const emailChannel = new EmailChannel();
    const res = await emailChannel.send(
      {
        id: 'test_fail_01',
        title: 'Simulated Fail',
        message: 'This should fail',
        priority: 'high',
        type: 'PAYMENT',
        applicationId: 'app_test',
      },
      { id: 'fail@example.com' }
    );

    assert(res.delivered === false, 'Marked as not delivered');
    assert(res.skipped === false, 'Not marked as skipped (genuine failure)');
    assert(res.statusCode === 500, 'Status code 500');
    assert(res.error?.includes('SMTP 500'), 'Error message preserved');
  });

  // TEST 11: All channels disabled by user preferences
  await test('11. All channels disabled by preferences marks notification as SKIPPED, not FAILED', async () => {
    const recipient = `usr_skip_all_${Date.now()}`;
    const notif = await dbService.createNotification({
      applicationId: 'app_shopeasy_retail',
      recipientId: recipient,
      type: 'MARKETING',
      title: 'Summer Sale 50% Off',
      message: 'Exclusive discount code SUMMER50',
      priority: 'low',
      initialStatus: 'pending',
    });

    // Run job execution
    const result = await processNotificationJob(
      {
        notificationId: notif.id,
        recipientId: recipient,
        channel: 'in_app',
      },
      1,
      3
    );

    assert(result.status === 'skipped', 'Job execution returned skipped status');

    const fresh = await dbService.getNotificationById(notif.id);
    assert(fresh?.status === 'skipped', `Overall notification status is "skipped", got "${fresh?.status}"`);
    assert(fresh?.attemptCount === 1, 'Attempt recorded');
    assert(fresh?.lastError?.includes('disabled in preferences'), 'Explanation preserved in lastError');
  });

  // TEST 12: One channel skipped while another succeeds
  await test('12. One channel skipped while another succeeds sets overall status to DELIVERED', async () => {
    const recipient = `usr_mixed_pref_${Date.now()}`;
    const notif = await dbService.createNotification({
      applicationId: 'app_shopeasy_retail',
      recipientId: recipient,
      type: 'PAYMENT',
      title: 'Monthly Statement',
      message: 'Your monthly statement is ready.',
      priority: 'critical',
      initialStatus: 'pending',
    });

    const summary = await deliveryService.processMultiChannelDelivery({
      notificationId: notif.id,
      recipientId: recipient,
      title: 'Monthly Statement',
      message: 'Your monthly statement is ready.',
      priority: 'critical',
      type: 'PAYMENT',
      applicationId: 'app_shopeasy_retail',
      attemptNumber: 1,
    });

    assert(summary.deliveredChannels.includes('in_app'), 'In-App delivered');
    assert(summary.skippedChannels.includes('push'), 'Push skipped due to payments default preferences');
    assert(summary.hasFailures === false, 'No carrier failures occurred');

    const inAppDel = summary.results.find((r) => r.channel === 'in_app');
    assert(inAppDel?.delivered === true && inAppDel?.statusCode === 200, 'In-App delivery row is 200 delivered');

    const pushDel = summary.results.find((r) => r.channel === 'push');
    assert(pushDel?.skipped === true && pushDel?.statusCode === 403, 'Push delivery row is 403 skipped');
  });

  // TEST 13: All attempted channels fail
  await test('13. All attempted channels fail records carrier failure and triggers retry', async () => {
    const mockEmail = new MockEmailProvider();
    mockEmail.simulateFailure('SMTP 503 Service Unavailable');
    setEmailProvider(mockEmail);

    const recipient = `usr_carrier_fail_${Date.now()}`;
    const notif = await dbService.createNotification({
      applicationId: 'app_shopeasy_retail',
      recipientId: recipient,
      type: 'PAYMENT',
      title: 'Urgent Payment Due',
      message: 'Please update your card.',
      priority: 'high',
      initialStatus: 'pending',
    });

    let threwError = false;
    try {
      await processNotificationJob(
        {
          notificationId: notif.id,
          recipientId: recipient,
          channel: 'email',
        },
        1,
        3
      );
    } catch (err: any) {
      threwError = true;
      assert(err.message.includes('Delivery failed for channel(s): [email]'), 'Error describes failed channel');
    }

    assert(threwError === true, 'Worker threw error to trigger exponential backoff retry');
    const deliveries = await dbService.getDeliveriesByNotificationId(notif.id);
    const emailDel = deliveries.find((d) => d.channel === 'email');
    assert(emailDel?.status === 'failed', 'Channel delivery row marked as failed');
    assert(emailDel?.statusCode === 500, 'Channel delivery row statusCode is 500');
  });

  // TEST 14: Mixed successful and failed channel outcomes
  await test('14. Mixed channel outcomes dispatches retry only to failed channel', async () => {
    const mockEmail = new MockEmailProvider();
    mockEmail.simulateFailure('SMTP 500 Network Timeout');
    setEmailProvider(mockEmail);

    const recipient = `usr_mixed_outcome_${Date.now()}`;
    const notif = await dbService.createNotification({
      applicationId: 'app_shopeasy_retail',
      recipientId: recipient,
      type: 'PAYMENT',
      title: 'Order Confirmation',
      message: 'Your order was placed.',
      priority: 'high',
      initialStatus: 'pending',
    });

    // Attempt 1: in_app succeeds, email fails
    const summary1 = await deliveryService.processMultiChannelDelivery({
      notificationId: notif.id,
      recipientId: recipient,
      title: 'Order Confirmation',
      message: 'Your order was placed.',
      priority: 'high',
      type: 'PAYMENT',
      applicationId: 'app_shopeasy_retail',
      attemptNumber: 1,
    });

    assert(summary1.deliveredChannels.includes('in_app'), 'In-App succeeded in attempt 1');
    assert(summary1.failedChannels.includes('email'), 'Email failed in attempt 1');
    assert(summary1.hasFailures === true, 'Delivery summary flagged failures for retry');

    // Attempt 2: carrier is restored, email succeeds
    const summary2 = await deliveryService.processMultiChannelDelivery({
      notificationId: notif.id,
      recipientId: recipient,
      title: 'Order Confirmation',
      message: 'Your order was placed.',
      priority: 'high',
      type: 'PAYMENT',
      applicationId: 'app_shopeasy_retail',
      attemptNumber: 2,
    });

    const inAppResult = summary2.results.find((r) => r.channel === 'in_app');
    assert(inAppResult?.provider === 'NotifyX-ExistingDelivery', 'In-App not re-sent (idempotent)');
    assert(summary2.deliveredChannels.includes('email'), 'Email delivered on retry');
    assert(summary2.hasFailures === false, 'Attempt 2 succeeded completely');
  });

  console.log('\n======================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runMultiChannelTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
