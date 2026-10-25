import assert from 'node:assert';
import { dbService } from '../services/dbService.ts';
import { processNotificationJob } from '../queue/jobProcessor.ts';
import {
  MockEmailProvider,
  getEmailProvider,
  resolveEmailProvider,
  setEmailProvider,
} from '../channels/providers/emailProvider.ts';
import { ResendEmailProvider } from '../channels/providers/resendProvider.ts';

async function runResendTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING RESEND EMAIL PROVIDER TEST SUITE');
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

  await test('1. Provider selection defaults to mock when EMAIL_PROVIDER is unset', async () => {
    const previousProvider = process.env.EMAIL_PROVIDER;
    const previousKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.RESEND_FROM_EMAIL;

    try {
      delete process.env.EMAIL_PROVIDER;
      delete process.env.RESEND_API_KEY;
      delete process.env.RESEND_FROM_EMAIL;

      const provider = resolveEmailProvider();
      assert.strictEqual(provider.name, 'MockEmailProvider', 'Unset provider should resolve to mock');
    } finally {
      if (previousProvider === undefined) {
        delete process.env.EMAIL_PROVIDER;
      } else {
        process.env.EMAIL_PROVIDER = previousProvider;
      }
      if (previousKey === undefined) {
        delete process.env.RESEND_API_KEY;
      } else {
        process.env.RESEND_API_KEY = previousKey;
      }
      if (previousFrom === undefined) {
        delete process.env.RESEND_FROM_EMAIL;
      } else {
        process.env.RESEND_FROM_EMAIL = previousFrom;
      }
    }
  });

  await test('2. Specific Resend provider selection resolves only with valid config', async () => {
    const previousProvider = process.env.EMAIL_PROVIDER;
    const previousKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.RESEND_FROM_EMAIL;

    try {
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.RESEND_API_KEY = 're_test_123';
      process.env.RESEND_FROM_EMAIL = 'notify@notifyx.dev';

      const provider = resolveEmailProvider();
      assert.strictEqual(provider.name, 'Resend', 'EMAIL_PROVIDER=resend resolves to Resend');
    } finally {
      if (previousProvider === undefined) {
        delete process.env.EMAIL_PROVIDER;
      } else {
        process.env.EMAIL_PROVIDER = previousProvider;
      }
      if (previousKey === undefined) {
        delete process.env.RESEND_API_KEY;
      } else {
        process.env.RESEND_API_KEY = previousKey;
      }
      if (previousFrom === undefined) {
        delete process.env.RESEND_FROM_EMAIL;
      } else {
        process.env.RESEND_FROM_EMAIL = previousFrom;
      }
    }
  });

  await test('3. Missing Resend config throws and never silently falls back to mock', async () => {
    const previousProvider = process.env.EMAIL_PROVIDER;
    const previousKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.RESEND_FROM_EMAIL;

    try {
      process.env.EMAIL_PROVIDER = 'resend';
      delete process.env.RESEND_API_KEY;
      process.env.RESEND_FROM_EMAIL = 'notify@notifyx.dev';

      assert.throws(() => resolveEmailProvider(), /RESEND_API_KEY/);
    } finally {
      if (previousProvider === undefined) {
        delete process.env.EMAIL_PROVIDER;
      } else {
        process.env.EMAIL_PROVIDER = previousProvider;
      }
      if (previousKey === undefined) {
        delete process.env.RESEND_API_KEY;
      } else {
        process.env.RESEND_API_KEY = previousKey;
      }
      if (previousFrom === undefined) {
        delete process.env.RESEND_FROM_EMAIL;
      } else {
        process.env.RESEND_FROM_EMAIL = previousFrom;
      }
    }
  });

  await test('3b. Resend accepts the common RESEND_EMAIL_FROM alias for the sender address', async () => {
    const previousProvider = process.env.EMAIL_PROVIDER;
    const previousKey = process.env.RESEND_API_KEY;
    const previousFrom = process.env.RESEND_FROM_EMAIL;
    const previousAlias = process.env.RESEND_EMAIL_FROM;

    try {
      process.env.EMAIL_PROVIDER = 'resend';
      process.env.RESEND_API_KEY = 're_test_123';
      delete process.env.RESEND_FROM_EMAIL;
      process.env.RESEND_EMAIL_FROM = 'notify@notifyx.dev';

      const provider = resolveEmailProvider();
      assert.strictEqual(provider.name, 'Resend', 'EMAIL_PROVIDER=resend resolves to Resend when sender uses the alias');
    } finally {
      if (previousProvider === undefined) {
        delete process.env.EMAIL_PROVIDER;
      } else {
        process.env.EMAIL_PROVIDER = previousProvider;
      }
      if (previousKey === undefined) {
        delete process.env.RESEND_API_KEY;
      } else {
        process.env.RESEND_API_KEY = previousKey;
      }
      if (previousFrom === undefined) {
        delete process.env.RESEND_FROM_EMAIL;
      } else {
        process.env.RESEND_FROM_EMAIL = previousFrom;
      }
      if (previousAlias === undefined) {
        delete process.env.RESEND_EMAIL_FROM;
      } else {
        process.env.RESEND_EMAIL_FROM = previousAlias;
      }
    }
  });

  await test('4. Resend provider sends a real API request with the notification content', async () => {
    const originalFetch = globalThis.fetch;
    const sentBodies: any[] = [];

    try {
      const mockFetch: typeof fetch = async (_input, init) => {
        const rawBody = init?.body ? JSON.parse(String(init.body)) : {};
        sentBodies.push(rawBody);
        return new Response(JSON.stringify({ id: 'resend_msg_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };
      globalThis.fetch = mockFetch;

      const provider = new ResendEmailProvider({
        apiKey: 're_test_123',
        from: 'notify@notifyx.dev',
        fromName: 'NotifyX',
      });

      const result = await provider.sendEmail({
        to: 'user@example.com',
        subject: 'Payment received',
        body: 'Your payment was processed successfully.',
        notificationId: 'notif_resend_success',
        priority: 'high',
      });

      assert.strictEqual(result.delivered, true, 'Resend accepted the email request');
      assert.strictEqual(result.provider, 'Resend', 'Provider identity is preserved');
      assert.strictEqual(result.statusCode, 200, 'Status code is correct');
      assert.ok(result.messageId.startsWith('resend_msg_'), 'Message ID comes from Resend');
      assert.strictEqual(sentBodies[0].to[0], 'user@example.com', 'Recipient is forwarded');
      assert.strictEqual(sentBodies[0].subject, 'Payment received', 'Subject is forwarded');
      assert.ok(sentBodies[0].html.includes('Your payment was processed successfully.'), 'Body is present in HTML payload');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await test('5. Resend provider surfaces provider errors without falling back to mock', async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ message: 'Unauthorized API key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });

      const provider = new ResendEmailProvider({
        apiKey: 'bad_key',
        from: 'notify@notifyx.dev',
      });

      const result = await provider.sendEmail({
        to: 'user@example.com',
        subject: 'Failed send',
        body: 'This should fail.',
        notificationId: 'notif_resend_fail',
      });

      assert.strictEqual(result.delivered, false, 'Failed provider request is recorded as not delivered');
      assert.strictEqual(result.statusCode, 401, 'HTTP status code is preserved');
      assert.match(result.error || '', /Unauthorized API key/i, 'Provider error is surfaced');
      assert.strictEqual(provider.name, 'Resend', 'Provider name remains actual provider name');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await test('6. Retry behavior still triggers for failed Resend email channels', async () => {
    const originalFetch = globalThis.fetch;
    const previousProvider = getEmailProvider();

    try {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ message: 'Rate limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });

      setEmailProvider(new ResendEmailProvider({
        apiKey: 're_rate_limited',
        from: 'notify@notifyx.dev',
      }));

      const recipient = `usr_resend_retry_${Date.now()}`;
      const notif = await dbService.createNotification({
        applicationId: 'app_shopeasy_retail',
        recipientId: recipient,
        type: 'PAYMENT',
        title: 'Resend retry test',
        message: 'Retry should trigger after provider error.',
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
        assert.match(err.message, /Delivery failed for channel\(s\): \[email\]/, 'Job failure includes the failed email channel');
      }

      assert.strictEqual(threwError, true, 'Provider failure triggers retry behavior');
      const deliveries = await dbService.getDeliveriesByNotificationId(notif.id);
      const emailDel = deliveries.find((d) => d.channel === 'email');
      assert.strictEqual(emailDel?.status, 'failed', 'Email delivery row records failure');
      assert.strictEqual(emailDel?.statusCode, 429, 'Failed status code is persisted');
    } finally {
      setEmailProvider(previousProvider);
      globalThis.fetch = originalFetch;
    }
  });

  console.log('\n======================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runResendTests().catch((err) => {
  console.error('Fatal Resend test error:', err);
  process.exit(1);
});
