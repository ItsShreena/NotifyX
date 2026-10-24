export interface PushSendOptions {
  recipientId: string;
  title: string;
  body: string;
  deviceToken?: string;
  notificationId: string;
  priority?: string;
  category?: string;
  data?: Record<string, unknown>;
}

export interface PushSendResult {
  messageId: string;
  provider: string;
  delivered: boolean;
  latencyMs: number;
  statusCode: number;
  error?: string;
}

/**
 * Common abstraction for mobile / web push notification dispatch.
 * Makes it trivial to plug in Firebase Cloud Messaging (FCM), APNs, or Web Push later.
 */
export interface PushProvider {
  readonly name: string;
  sendPush(options: PushSendOptions): Promise<PushSendResult>;
}

/**
 * Development & mock push provider.
 * Logs clean push notification development output and keeps in-memory ledger for test verification.
 * Zero external credentials or paid services required.
 */
export class MockPushProvider implements PushProvider {
  readonly name = 'MockPushProvider';
  private sentPushes: PushSendOptions[] = [];
  private shouldFailNext = false;
  private failErrorMessage = 'APNs 503 Service Unavailable';

  async sendPush(options: PushSendOptions): Promise<PushSendResult> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 25));

    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      const latencyMs = Date.now() - start;
      console.warn(`⚠️ [MockPushProvider] Simulated failure sending push to ${options.recipientId}: ${this.failErrorMessage}`);
      return {
        messageId: '',
        provider: this.name,
        delivered: false,
        latencyMs,
        statusCode: 503,
        error: this.failErrorMessage,
      };
    }

    this.sentPushes.push(options);

    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│ 📱 PUSH NOTIFICATION (Development Mock Provider)       │');
    console.log('├────────────────────────────────────────────────────────┤');
    console.log(`│ Recipient: ${options.recipientId.padEnd(43)} │`);
    console.log(`│ Title:     ${options.title.slice(0, 43).padEnd(43)} │`);
    console.log(`│ Body:      ${options.body.slice(0, 43).padEnd(43)} │`);
    if (options.deviceToken) {
      console.log(`│ Token:     ${options.deviceToken.slice(0, 43).padEnd(43)} │`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    return {
      messageId: `mock_push_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      provider: this.name,
      delivered: true,
      latencyMs: Date.now() - start,
      statusCode: 200,
    };
  }

  getSentPushes(): PushSendOptions[] {
    return [...this.sentPushes];
  }

  clearSentPushes(): void {
    this.sentPushes = [];
  }

  simulateFailure(failMessage = 'APNs 503 Service Unavailable'): void {
    this.shouldFailNext = true;
    this.failErrorMessage = failMessage;
  }
}

let activePushProvider: PushProvider = new MockPushProvider();

export function getPushProvider(): PushProvider {
  return activePushProvider;
}

export function setPushProvider(provider: PushProvider): void {
  activePushProvider = provider;
}
