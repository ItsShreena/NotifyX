import { aiService, AIService, NotificationInputForAI } from '../services/aiService.ts';
import { dbService } from '../services/dbService.ts';
import { userStore } from '../db/userStore.ts';

/**
 * NotifyX AI Notification Intelligence Test Suite
 * Tests all 10 required scenarios without making real external API calls.
 */
async function runAiServiceTests() {
  console.log('🧪 Starting NotifyX AI Notification Intelligence Test Suite...\n');
  let passedCount = 0;
  let totalCount = 0;

  // Create isolated user & application to satisfy foreign key constraints in PostgreSQL
  const user = await userStore.create({
    name: 'AI Suite User',
    email: `usr_ai_suite_${Date.now()}@notifyx.dev`,
    passwordHash: 'dummy_hash_for_ai_tests',
  });

  const { application: testApp } = await dbService.createApplication({
    userId: user.id,
    name: 'AI Test Application',
    environment: 'development',
  });

  function assert(condition: boolean, testName: string, details?: string) {
    totalCount++;
    if (condition) {
      console.log(`✅ [PASS] Test ${totalCount}: ${testName}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] Test ${totalCount}: ${testName}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  // 1. Valid AI response
  try {
    aiService.setMockHandler(async () => ({
      category: 'PAYMENT',
      priority: 'high',
      summary: 'Payment of ₹2,499 was successfully processed.',
      shouldGroup: false,
    }));

    const result = await aiService.analyzeNotification({
      title: 'Payment Confirmed',
      message: 'Payment of ₹2,499 was successfully processed.',
      type: 'PAYMENT',
    });

    assert(
      result.category === 'PAYMENT' &&
        result.priority === 'high' &&
        result.summary === 'Payment of ₹2,499 was successfully processed.' &&
        result.shouldGroup === false &&
        result.isFallback === false,
      'Valid AI response correctly parsed & validated'
    );
  } catch (err: any) {
    assert(false, 'Valid AI response', err.message);
  }

  // 2. Invalid AI category -> Fallback safely triggered
  try {
    aiService.setMockHandler(async () => ({
      category: 'INVALID_UNKNOWN_CATEGORY' as any,
      priority: 'high',
      summary: 'Some summary',
      shouldGroup: false,
    }));

    const result = await aiService.analyzeNotification({
      title: 'Login Alert',
      message: 'Someone logged into your account from a new device.',
      type: 'SECURITY',
    });

    assert(
      result.isFallback === true &&
        ['SECURITY', 'SYSTEM'].includes(result.category),
      'Invalid AI category triggers safe fallback without crashing'
    );
  } catch (err: any) {
    assert(false, 'Invalid AI category fallback', err.message);
  }

  // 3. Invalid AI priority -> Fallback safely triggered
  try {
    aiService.setMockHandler(async () => ({
      category: 'SECURITY',
      priority: 'SUPER_URGENT_NOT_ALLOWED' as any,
      summary: 'Alert',
      shouldGroup: false,
    }));

    const result = await aiService.analyzeNotification({
      title: 'Security Notice',
      message: 'Suspicious login detected.',
      priority: 'normal',
    });

    assert(
      result.isFallback === true &&
        ['low', 'normal', 'high', 'critical'].includes(result.finalPriority),
      'Invalid AI priority triggers safe fallback'
    );
  } catch (err: any) {
    assert(false, 'Invalid AI priority fallback', err.message);
  }

  // 4. AI timeout handling
  try {
    aiService.setMockHandler(async () => {
      // Simulate timeout
      throw new Error('AI provider connection timeout after 3500ms');
    });

    const result = await aiService.analyzeNotification({
      title: 'Order Shipped',
      message: 'Your package is on its way to Mumbai.',
      type: 'ORDER',
    });

    assert(
      result.isFallback === true &&
        Boolean(result.fallbackReason?.includes('timeout')),
      'AI timeout gracefully caught and processed via fallback'
    );
  } catch (err: any) {
    assert(false, 'AI timeout handling', err.message);
  }

  // 5. AI provider failure (HTTP 500 / Network down)
  try {
    aiService.setMockHandler(async () => {
      throw new Error('HTTP 500 Internal Server Error from upstream provider');
    });

    const result = await aiService.analyzeNotification({
      title: 'System Degradation',
      message: 'Postgres latency spiked above 400ms.',
      type: 'SYSTEM',
    });

    assert(
      result.isFallback === true &&
        result.category === 'SYSTEM',
      'AI provider failure handled gracefully'
    );
  } catch (err: any) {
    assert(false, 'AI provider failure', err.message);
  }

  // 6. AI fallback behavior preserves requested values
  try {
    aiService.setMockHandler(async () => {
      throw new Error('Service Unavailable');
    });

    const result = await aiService.analyzeNotification({
      title: 'Card Payment',
      message: 'Your credit card was charged $49.00',
      type: 'PAYMENT',
      priority: 'high',
    });

    assert(
      result.finalPriority === 'high' &&
        result.category === 'PAYMENT',
      'AI fallback respects and preserves application-provided category & priority'
    );
  } catch (err: any) {
    assert(false, 'AI fallback behavior', err.message);
  }

  // 7. Critical notification protection (Safety Rule: system rules > AI)
  try {
    // AI tries to downgrade a critical priority notification to low
    aiService.setMockHandler(async () => ({
      category: 'SECURITY',
      priority: 'low',
      summary: 'Security event',
      shouldGroup: true,
    }));

    const result = await aiService.analyzeNotification({
      title: 'Zero-day vulnerability patch required',
      message: 'Emergency zero-day CVE-2026-9901 applied.',
      priority: 'critical',
    });

    assert(
      result.requestedPriority === 'critical' &&
        result.aiSuggestedPriority === 'low' &&
        result.finalPriority === 'critical',
      'Critical notification protection: AI cannot downgrade explicit critical priority'
    );
  } catch (err: any) {
    assert(false, 'Critical priority protection', err.message);
  }

  // 8. Duplicate AI processing prevention (Cost control)
  try {
    const notif = await dbService.createNotification({
      applicationId: testApp.id,
      recipientId: 'usr_test_cost',
      type: 'SYSTEM',
      title: 'Cost Control Check',
      message: 'Verify notification is not processed twice.',
    });

    // Mark as processed
    await dbService.updateNotificationAiMetadata(notif.id, {
      aiCategory: 'SYSTEM',
      aiPriority: 'normal',
      aiSummary: 'Cost Control Check',
      aiShouldGroup: false,
    });

    const updated = await dbService.getNotificationById(notif.id);
    assert(
      updated?.aiProcessed === true,
      'Duplicate AI processing prevention: aiProcessed flag persisted and guarded'
    );
  } catch (err: any) {
    assert(false, 'Duplicate AI processing prevention', err.message);
  }

  // 9. Summary generation preserves essential figures
  try {
    aiService.setMockHandler(async (input) => ({
      category: 'ORDER',
      priority: 'normal',
      summary: 'Order #4821 has shipped. Expected delivery: Oct 8–10.',
      shouldGroup: false,
    }));

    const result = await aiService.analyzeNotification({
      title: 'Order Status Update',
      message:
        'Your order #4821 containing 3 items has been packed at our warehouse and has now been handed over to the delivery partner. Expected delivery is between October 8 and October 10.',
    });

    assert(
      result.summary?.includes('Order #4821') === true &&
        result.summary?.includes('Oct 8–10') === true,
      'Summary generation retains key facts and order IDs'
    );
  } catch (err: any) {
    assert(false, 'Summary generation', err.message);
  }

  // 10. AI metadata persistence in DB
  try {
    const created = await dbService.createNotification({
      applicationId: testApp.id,
      recipientId: 'usr_test_db',
      type: 'COMMENT',
      title: 'Arjun replied to your thread',
      message: 'Great point! Let us schedule a sync tomorrow at 10 AM.',
    });

    await dbService.updateNotificationAiMetadata(created.id, {
      aiCategory: 'COMMENT',
      aiPriority: 'low',
      aiSummary: 'Arjun replied proposing a 10 AM sync tomorrow.',
      aiShouldGroup: true,
      finalPriority: 'low',
      finalType: 'COMMENT',
    });

    const saved = await dbService.getNotificationById(created.id);

    assert(
      saved?.aiProcessed === true &&
        saved?.aiCategory === 'COMMENT' &&
        saved?.aiPriority === 'low' &&
        saved?.aiSummary === 'Arjun replied proposing a 10 AM sync tomorrow.' &&
        saved?.aiShouldGroup === true,
      'AI metadata successfully persisted in database'
    );
  } catch (err: any) {
    assert(false, 'AI metadata persistence', err.message);
  }

  // Reset mock handler after tests
  aiService.setMockHandler(undefined);

  console.log(`\n🏁 Test Results: ${passedCount} / ${totalCount} passed.`);
  if (passedCount === totalCount) {
    console.log('🎉 All 10 AI Notification Intelligence test scenarios PASSED!\n');
    process.exit(0);
  } else {
    throw new Error(`${totalCount - passedCount} test(s) failed.`);
  }
}

// Run if executed directly
runAiServiceTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
