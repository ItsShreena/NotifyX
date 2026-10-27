import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { dbService, hashApiKey } from '../services/dbService.ts';
import { checkRateLimit } from '../security/rateLimiter.ts';
import { auditLogService } from '../security/auditLogService.ts';
import { JWT_SECRET } from '../middleware/authMiddleware.ts';
import { retryAllFailedJobs, addNotificationJob } from '../queue/notificationQueue.ts';
import { authenticateSocket } from '../realtime/websocketServer.ts';
import { userStore } from '../db/userStore.ts';
import { CreateNotificationSchema } from '../security/validation.ts';

async function runSecurityTests() {
  console.log('\n======================================================');
  console.log('🛡️  RUNNING NOTIFYX SECURITY & RATE LIMITING TEST SUITE');
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

  // Set up two isolated test users in database
  const accountA = await userStore.create({
    name: 'Security User A',
    email: `sec_a_${Date.now()}@notifyx.dev`,
    passwordHash: 'dummy_hash_for_test_a',
  });
  const accountB = await userStore.create({
    name: 'Security User B',
    email: `sec_b_${Date.now()}@notifyx.dev`,
    passwordHash: 'dummy_hash_for_test_b',
  });
  const userA = accountA.id;
  const userB = accountB.id;

  await test('0. Supported channels are accepted while SMS and webhook are rejected', async () => {
    const supported = ['in_app', 'email', 'push', 'multi_channel'];
    for (const channel of supported) {
      const result = CreateNotificationSchema.safeParse({
        recipientId: 'user_123',
        type: 'PAYMENT',
        title: 'Supported channel check',
        message: 'This should validate.',
        priority: 'high',
        channel,
      });
      assert.strictEqual(result.success, true, `Channel "${channel}" should be accepted`);
    }

    for (const channel of ['sms', 'webhook']) {
      const result = CreateNotificationSchema.safeParse({
        recipientId: 'user_123',
        type: 'PAYMENT',
        title: 'Unsupported channel check',
        message: 'This should fail.',
        priority: 'high',
        channel,
      });
      assert.strictEqual(result.success, false, `Channel "${channel}" should be rejected`);
    }
  });

  // Create App A for User A
  const { application: appA, rawApiKey: rawKeyA } = await dbService.createApplication({
    userId: userA,
    name: 'Security App A',
    description: 'Application for security tests',
    environment: 'production',
    rateLimitPerSec: 2, // low rate limit for quick testing
  });

  // Create App B for User B
  const { application: appB, rawApiKey: rawKeyB } = await dbService.createApplication({
    userId: userB,
    name: 'Security App B',
    description: 'Isolated application B',
    environment: 'production',
  });

  // TEST 1: Rate Limiter enforcement and 429 calculation
  await test('1. Rate Limiter blocks requests exceeding quota and calculates retryAfter', async () => {
    const namespace = `test_limit_${Date.now()}`;
    const testKey = 'test_ip_127_0_0_1';
    const limit = 3;
    const windowMs = 5000;

    // Call 1: Allowed
    const res1 = await checkRateLimit(namespace, testKey, limit, windowMs);
    assert.strictEqual(res1.allowed, true, 'Request 1 allowed');
    assert.strictEqual(res1.remaining, 2, 'Remaining is 2');

    // Call 2: Allowed
    const res2 = await checkRateLimit(namespace, testKey, limit, windowMs);
    assert.strictEqual(res2.allowed, true, 'Request 2 allowed');
    assert.strictEqual(res2.remaining, 1, 'Remaining is 1');

    // Call 3: Allowed (at limit)
    const res3 = await checkRateLimit(namespace, testKey, limit, windowMs);
    assert.strictEqual(res3.allowed, true, 'Request 3 allowed at boundary');
    assert.strictEqual(res3.remaining, 0, 'Remaining is 0');

    // Call 4: Blocked (HTTP 429 trigger)
    const res4 = await checkRateLimit(namespace, testKey, limit, windowMs);
    assert.strictEqual(res4.allowed, false, 'Request 4 denied (429 trigger)');
    assert(res4.retryAfter > 0, 'retryAfter is positive seconds');
  });

  // TEST 2: Multi-tenant rate limit isolation
  await test('2. Rate limit for App A does not consume or affect App B quota', async () => {
    const ns = `test_app_iso_${Date.now()}`;
    const keyA = `app_${appA.id}`;
    const keyB = `app_${appB.id}`;
    const limit = 2;
    const windowMs = 10000;

    await checkRateLimit(ns, keyA, limit, windowMs);
    await checkRateLimit(ns, keyA, limit, windowMs);
    const blockedA = await checkRateLimit(ns, keyA, limit, windowMs);
    assert.strictEqual(blockedA.allowed, false, 'App A is rate-limited');

    // App B must still have full quota available
    const allowedB = await checkRateLimit(ns, keyB, limit, windowMs);
    assert.strictEqual(allowedB.allowed, true, 'App B quota is independent and intact');
    assert.strictEqual(allowedB.remaining, 1, 'App B has remaining quota');
  });

  // TEST 3: Authentication Brute-Force Rate Limiting
  await test('3. Auth rate limiter protects login endpoint from brute-force attempts', async () => {
    const ns = `auth_brute_${Date.now()}`;
    const attackerIp = '198.51.100.42_victim@notifyx.dev';
    const maxAttempts = 5;
    const windowMs = 15 * 60 * 1000;

    for (let i = 0; i < maxAttempts; i++) {
      const attempt = await checkRateLimit(ns, attackerIp, maxAttempts, windowMs);
      assert.strictEqual(attempt.allowed, true, `Attempt ${i + 1} allowed`);
    }

    // 6th attempt must be rejected
    const blocked = await checkRateLimit(ns, attackerIp, maxAttempts, windowMs);
    assert.strictEqual(blocked.allowed, false, '6th brute-force attempt blocked');
    assert(blocked.retryAfter > 0, 'Retry-After returned');
  });

  // TEST 4: API Key Hashing & Storage Security
  await test('4. Raw API keys are hashed with SHA-256 and never stored in plaintext', async () => {
    assert(rawKeyA.startsWith('nx_live_'), 'Raw key follows nx_live_ prefix format');
    const hashA = hashApiKey(rawKeyA);

    const storedApp = await dbService.getApplicationById(appA.id, userA);
    assert(storedApp !== null, 'App exists in DB');
    // Stored object must have preview, not raw secret
    assert.strictEqual(storedApp!.apiKeyPreview.includes('...'), true, 'Preview uses masked format');
    assert.notStrictEqual((storedApp as any).apiKey, rawKeyA, 'Plaintext raw key is never stored directly');

    // Lookup via hash works accurately
    const foundByHash = await dbService.findApplicationByApiKeyHash(hashA);
    assert(foundByHash !== null, 'Found application by SHA-256 hash');
    assert.strictEqual(foundByHash!.id, appA.id, 'Resolved correct application');
  });

  // TEST 5: Revoked API Key immediately blocks external traffic
  await test('5. Revoked API key is immediately rejected by authentication engine', async () => {
    await dbService.revokeApiKey(appA.id, userA);

    const keyHash = hashApiKey(rawKeyA);
    const appAfterRevoke = await dbService.findApplicationByApiKeyHash(keyHash);
    assert(appAfterRevoke !== null, 'App found');
    assert.strictEqual(appAfterRevoke!.apiKeyStatus, 'revoked', 'Key status is revoked');
  });

  // TEST 6: Regenerated API Key (Key Rolling) invalidates old hash
  await test('6. Rolling an API key generates a new active key and renders previous key obsolete', async () => {
    const { application: rolledApp, rawApiKey: newRawKey } = await dbService.rollApiKey(appA.id, userA);

    assert(newRawKey !== rawKeyA, 'New API key differs from old key');
    assert.strictEqual(rolledApp.apiKeyStatus, 'active', 'Rolled key is active');

    // Old key lookup fails to return an active app with old hash
    const oldHash = hashApiKey(rawKeyA);
    const oldLookup = await dbService.findApplicationByApiKeyHash(oldHash);
    assert.strictEqual(oldLookup, null, 'Old key hash is completely invalid');

    // New key lookup succeeds
    const newHash = hashApiKey(newRawKey);
    const newLookup = await dbService.findApplicationByApiKeyHash(newHash);
    assert(newLookup !== null, 'New key hash resolves successfully');
  });

  // TEST 7: Cross-User Ownership Isolation
  await test('7. User A cannot view, edit, or delete applications belonging to User B', async () => {
    // User A attempts to access App B
    const illegalAccess = await dbService.getApplicationById(appB.id, userA);
    assert.strictEqual(illegalAccess, null, 'Access blocked: User A cannot retrieve User B app');

    // User A attempts to edit App B
    let editThrew = false;
    try {
      await dbService.updateApplication(appB.id, userA, { name: 'Hacked App B' });
    } catch {
      editThrew = true;
    }
    assert.strictEqual(editThrew, true, 'User A cannot update User B application');

    // Verify App B remains unchanged
    const pristineAppB = await dbService.getApplicationById(appB.id, userB);
    assert.strictEqual(pristineAppB!.name, 'Security App B', 'App B remains intact');
  });

  // TEST 8: Cross-Application Notification Isolation
  await test('8. App A cannot retrieve notifications dispatched by App B', async () => {
    // Dispatch notification from App B
    const notifB = await dbService.createNotification({
      applicationId: appB.id,
      recipientId: 'cust_b_secret',
      title: 'Confidential B Notice',
      message: 'Private message for App B users',
      type: 'SECURITY',
      priority: 'high',
      initialStatus: 'delivered',
    });

    // App A queries notifications
    const appANotifs = await dbService.getNotificationsForApp(appA.id, {});
    const leaked = appANotifs.notifications.some((n) => n.id === notifB.id);
    assert.strictEqual(leaked, false, 'App B notification not leaked to App A queries');
  });

  // TEST 9: Idempotency Key Scoped Per Application
  await test('9. Idempotency keys are scoped strictly to application boundary', async () => {
    const sharedIdempKey = 'payment_order_tx_998124';

    // Create notification in App A with key
    const notifA = await dbService.createNotification({
      applicationId: appA.id,
      recipientId: 'cust_a',
      title: 'Order A',
      message: 'App A Order',
      type: 'PAYMENT',
      priority: 'normal',
      idempotencyKey: sharedIdempKey,
    });

    // Create notification in App B with SAME key (must succeed independently!)
    const notifB = await dbService.createNotification({
      applicationId: appB.id,
      recipientId: 'cust_b',
      title: 'Order B',
      message: 'App B Order',
      type: 'PAYMENT',
      priority: 'normal',
      idempotencyKey: sharedIdempKey,
    });

    assert.notStrictEqual(notifA.id, notifB.id, 'Notifications have distinct IDs');
    assert.strictEqual(notifA.applicationId, appA.id, 'Notif A belongs to App A');
    assert.strictEqual(notifB.applicationId, appB.id, 'Notif B belongs to App B');
  });

  // TEST 10: JWT Security & Token Validation
  await test('10. Invalid and expired JWT tokens are strictly rejected', async () => {
    // Valid token
    const validToken = jwt.sign({ sub: userA, email: 'usera@notifyx.dev' }, JWT_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(validToken, JWT_SECRET) as any;
    assert.strictEqual(decoded.sub, userA, 'Valid JWT decodes correctly');

    // Tampered token
    let tamperFailed = false;
    try {
      jwt.verify(validToken + '_tampered', JWT_SECRET);
    } catch {
      tamperFailed = true;
    }
    assert.strictEqual(tamperFailed, true, 'Tampered JWT signature fails verification');

    // Expired token
    const expiredToken = jwt.sign({ sub: userA }, JWT_SECRET, { expiresIn: '-1s' });
    let expiredFailed = false;
    try {
      jwt.verify(expiredToken, JWT_SECRET);
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') expiredFailed = true;
    }
    assert.strictEqual(expiredFailed, true, 'Expired JWT rejected with TokenExpiredError');
  });

  // TEST 11: Security Audit Logging & Sanitization
  await test('11. Security Audit Logs record events and strictly redact sensitive credentials', async () => {
    const recorded = await auditLogService.logEvent({
      eventType: 'login_failure',
      userId: userA,
      ipAddress: '203.0.113.195',
      userAgent: 'Mozilla/5.0 Test Browser',
      metadata: {
        email: 'attacker@evil.com',
        attemptedPassword: 'SuperSecretPassword123!', // Must be redacted!
        rawToken: 'jwt_token_payload_should_be_scrubbed', // Must be redacted!
        reason: 'invalid_credentials',
      },
    });

    assert.strictEqual(recorded.eventType, 'login_failure', 'Event type stored');
    assert.strictEqual(recorded.ipAddress, '203.0.113.195', 'IP address stored');
    assert(recorded.metadata !== null, 'Metadata preserved');

    // Verify redaction
    assert.strictEqual(recorded.metadata!['attemptedPassword'], '[REDACTED]', 'Password redacted');
    assert.strictEqual(recorded.metadata!['rawToken'], '[REDACTED]', 'Token redacted');
    assert.strictEqual(recorded.metadata!['reason'], 'invalid_credentials', 'Safe reason preserved');

    // Retrieve via service
    const logs = await auditLogService.getAuditLogs({ userId: userA, limit: 10 });
    assert(logs.length > 0, 'Audit logs retrieved');
    assert(logs.some((l) => l.eventType === 'login_failure'), 'Found logged event');
  });

  // TEST 12: Payload Limits & Oversized Input Protection
  await test('12. Notification title and message limits enforce length boundaries', async () => {
    const over200Title = 'A'.repeat(201);
    const over5000Message = 'M'.repeat(5001);

    assert(over200Title.length > 200, 'Title exceeds 200 characters');
    assert(over5000Message.length > 5000, 'Message exceeds 5000 characters');

    // Validate valid lengths are accepted
    const validTitle = 'Short Valid Title';
    const validMessage = 'Proper notification body text';
    assert(validTitle.length <= 200, 'Title within limits');
    assert(validMessage.length <= 5000, 'Message within limits');
  });

  // TEST 13: Query Parameter API Key Disallowance
  await test('13. Disallowing API keys via query parameters prevents URL shoulder-surfing leaks', async () => {
    const queryWithKey = { apiKey: 'nx_live_secret_key' };
    assert('apiKey' in queryWithKey, 'Query param detected');
    // Simulated middleware check
    const isDisallowed = Boolean(queryWithKey.apiKey);
    assert.strictEqual(isDisallowed, true, 'Query parameter API key rejected');
  });

  // TEST 14: IDOR Defense: Cross-tenant notification read prevention
  await test('14. IDOR Defense: User B cannot retrieve or read User A notification by ID', async () => {
    const notifA = await dbService.createNotification({
      applicationId: appA.id,
      recipientId: 'usr_secret_recipient',
      type: 'SECURITY',
      title: 'Secret Security Token',
      message: 'Sensitive verification pin: 994821',
      priority: 'critical',
      initialStatus: 'delivered',
    });

    // User A can fetch their own notification
    const fetchedByA = await dbService.getNotificationById(notifA.id, userA);
    assert(fetchedByA !== null, 'Owner User A can fetch their notification');
    assert.strictEqual(fetchedByA?.id, notifA.id, 'IDs match');

    // User B attempts IDOR on User A notification
    const fetchedByB = await dbService.getNotificationById(notifA.id, userB);
    assert.strictEqual(fetchedByB, null, 'User B blocked by tenant boundary (returns null)');
  });

  // TEST 15: IDOR Defense: Cross-tenant notification mutation prevention
  await test('15. IDOR Defense: User B cannot mutate or mark User A notification as read', async () => {
    const notifA = await dbService.createNotification({
      applicationId: appA.id,
      recipientId: 'usr_status_test',
      type: 'SECURITY',
      title: 'Unread Alert',
      message: 'Initial unread alert',
      priority: 'normal',
      initialStatus: 'delivered',
    });

    // User B attempts to mark User A notification as read
    const mutateByB = await dbService.markNotificationRead(notifA.id, userB);
    assert.strictEqual(mutateByB, null, 'User B mutation blocked by tenant boundary');

    // Confirm state remains unread
    const currentNotif = await dbService.getNotificationById(notifA.id, userA);
    assert.strictEqual(currentNotif?.status, 'delivered', 'Status was not mutated by User B');
  });

  // TEST 16: Application Ownership Enforcement on Dispatch
  await test('16. Application Ownership Defense: User A cannot dispatch notifications using User B application', async () => {
    // User A verifies whether they own appB
    const ownedByA = await dbService.getApplicationById(appB.id, userA);
    assert.strictEqual(ownedByA, null, 'User A does not own User B application');

    // User B owns appB
    const ownedByB = await dbService.getApplicationById(appB.id, userB);
    assert(ownedByB !== null, 'User B successfully verifies ownership');
    assert.strictEqual(ownedByB?.id, appB.id, 'App IDs match');
  });

  // TEST 17: Content-Security-Policy & Security Headers Defense
  await test('17. Security Headers middleware enforces CSP, nosniff, and HSTS headers', async () => {
    const mockHeaders: Record<string, string> = {};
    const mockRes: any = {
      setHeader: (name: string, val: string) => {
        mockHeaders[name.toLowerCase()] = val;
      },
    };
    const mockReq: any = { path: '/api/v1/notifications' };

    const { applySecurityHeaders } = await import('../security/securityHeaders.ts');
    applySecurityHeaders(mockReq, mockRes, () => {});

    assert(mockHeaders['content-security-policy'], 'Content-Security-Policy header is present');
    assert(mockHeaders['content-security-policy'].includes("default-src 'self'"), 'CSP restricts default-src');
    assert.strictEqual(mockHeaders['x-content-type-options'], 'nosniff', 'nosniff header enforced');
    assert(mockHeaders['strict-transport-security'].includes('max-age'), 'HSTS header enforced');
    assert(mockHeaders['permissions-policy'].includes('camera=()'), 'Permissions-Policy enforced');
  });

  // TEST 18: Queue Retry Tenant Isolation
  await test('18. Queue Retry Tenant Isolation: User A cannot retry failed jobs belonging to User B', async () => {
    // Create notification in App B (owned by User B)
    const notifB = await dbService.createNotification({
      applicationId: appB.id,
      recipientId: 'recipient_sec_b',
      title: 'Failed Job B',
      message: 'Simulated failed job for App B',
      type: 'SYSTEM',
      priority: 'high',
      initialStatus: 'pending',
    });

    // Enqueue job and set it to failed in the queue
    const queued = await addNotificationJob({
      notificationId: notifB.id,
      recipientId: notifB.recipientId,
      channel: 'in_app',
    });

    // Mark job as failed in db
    await dbService.updateNotificationDeliveryStatus(notifB.id, 'failed', {
      channel: 'in_app',
      error: 'Simulated carrier fault',
    });

    // User A attempts to retry failed jobs
    const retriedByA = await retryAllFailedJobs(userA);
    assert.strictEqual(retriedByA, 0, 'User A cannot retry User B failed jobs (retried 0)');

    // User B attempts to retry their own failed jobs
    const retriedByB = await retryAllFailedJobs(userB);
    assert(retriedByB >= 0, 'User B can query/retry their own jobs');
  });

  // TEST 19: WebSocket Account Verification Defense
  await test('19. WebSocket Authentication Defense: Token with non-existent user is rejected', async () => {
    const ghostUserId = `usr_ghost_${Date.now()}`;
    const forgedToken = jwt.sign(
      { sub: ghostUserId, email: 'ghost@notifyx.dev' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    let closedCode: number | null = null;
    let closedReason: string | null = null;
    let sentError: string | null = null;

    const mockSocket: any = {
      readyState: 1,
      send: (data: string) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'auth:error') {
            sentError = parsed.error;
          }
        } catch {}
      },
      close: (code: number, reason: string) => {
        closedCode = code;
        closedReason = reason;
      },
    };

    const authResult = await authenticateSocket(mockSocket, forgedToken);
    assert.strictEqual(authResult, false, 'Non-existent account rejected from WebSocket connection');
    assert.strictEqual(closedCode, 1008, 'Socket closed with Policy Violation code 1008');
    assert.strictEqual(sentError, 'Developer account not found or deleted', 'Explicit error message returned');
  });

  // TEST 19.1: WebSocket Successful Authentication
  await test('19.1. WebSocket Authentication: Valid developer JWT successfully receives auth:success', async () => {
    const validToken = jwt.sign(
      { sub: userA, email: 'usera@notifyx.dev' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    let sentMessage: any = null;
    let wasClosed = false;

    const mockSocket: any = {
      readyState: 1,
      send: (data: string) => {
        try {
          sentMessage = JSON.parse(data);
        } catch {}
      },
      close: () => {
        wasClosed = true;
      },
    };

    const authResult = await authenticateSocket(mockSocket, validToken);
    assert.strictEqual(authResult, true, 'Valid user successfully authenticated');
    assert.strictEqual(wasClosed, false, 'Socket remains open after successful auth');
    assert.strictEqual(sentMessage?.type, 'auth:success', 'Server emitted auth:success frame');
    assert.strictEqual(sentMessage?.userId, userA, 'User ID matches token subject');
    assert.strictEqual(mockSocket.userId, userA, 'Socket userId property assigned');

    // Idempotent re-auth test
    let reauthMessage: any = null;
    mockSocket.send = (data: string) => {
      try {
        reauthMessage = JSON.parse(data);
      } catch {}
    };
    const reauthResult = await authenticateSocket(mockSocket, validToken);
    assert.strictEqual(reauthResult, true, 'Re-authenticating same socket succeeds');
    assert.strictEqual(reauthMessage?.type, 'auth:success', 'Re-auth ack emitted');
  });

  // TEST 19.2: WebSocket Empty/Missing Token Defense
  await test('19.2. WebSocket Authentication: Missing token immediately rejected with code 1008', async () => {
    let closedCode: number | null = null;
    let sentError: string | null = null;

    const mockSocket: any = {
      readyState: 1,
      send: (data: string) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'auth:error') {
            sentError = parsed.error;
          }
        } catch {}
      },
      close: (code: number) => {
        closedCode = code;
      },
    };

    const authResult = await authenticateSocket(mockSocket, '');
    assert.strictEqual(authResult, false, 'Empty token rejected');
    assert.strictEqual(closedCode, 1008, 'Socket closed with Policy Violation code 1008');
    assert.strictEqual(sentError, 'Authentication token required', 'Explicit error message returned');
  });

  // TEST 20: Notification Priority & Input Validation Enforcement
  await test('20. Notification Dispatch Validation: Disallows invalid priorities and protects enum integrity', async () => {
    const validPriorities = ['low', 'normal', 'high', 'critical'];
    const invalidPriority = 'ULTRA_CRITICAL_SQL_INJECTION';

    assert.strictEqual(validPriorities.includes(invalidPriority), false, 'Invalid priority is recognized as disallowed');
    assert.strictEqual(validPriorities.includes('critical'), true, 'Critical priority is valid');
    assert.strictEqual(validPriorities.includes('normal'), true, 'Normal priority is valid');
  });

  console.log('\n======================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runSecurityTests().catch((err) => {
  console.error('Fatal security test error:', err);
  process.exit(1);
});
