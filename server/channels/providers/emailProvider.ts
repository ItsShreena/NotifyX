import { ResendEmailProvider } from './resendProvider.ts';

export interface EmailSendOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
  notificationId: string;
  category?: string;
  priority?: string;
  metadata?: Record<string, unknown>;
}

export interface EmailSendResult {
  messageId: string;
  provider: string;
  delivered: boolean;
  latencyMs: number;
  statusCode: number;
  error?: string;
}

/**
 * Common abstraction for email dispatch.
 * Makes it trivial to plug in Resend, SendGrid, or AWS SES later without changing EmailChannel.
 */
export interface EmailProvider {
  readonly name: string;
  sendEmail(options: EmailSendOptions): Promise<EmailSendResult>;
}

/**
 * Development & mock email provider.
 * Logs clear development email output and maintains an in-memory delivery ledger for verification.
 * Zero external credentials or paid services required.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'MockEmailProvider';
  private sentMails: EmailSendOptions[] = [];
  private shouldFailNext = false;
  private failErrorMessage = 'SMTP 500 Connection Refused';

  /**
   * Test-only injection hook for failure scenarios. This does not represent a real provider outage.
   */
  simulateFailure(failMessage = 'SMTP 500 Connection Refused'): void {
    this.shouldFailNext = true;
    this.failErrorMessage = failMessage;
  }

  async sendEmail(options: EmailSendOptions): Promise<EmailSendResult> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 35));

    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      const latencyMs = Date.now() - start;
      console.warn(`⚠️ [MockEmailProvider] Simulated failure sending email to ${options.to}: ${this.failErrorMessage}`);
      return {
        messageId: '',
        provider: this.name,
        delivered: false,
        latencyMs,
        statusCode: 500,
        error: this.failErrorMessage,
      };
    }

    this.sentMails.push(options);

    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│ 📧 EMAIL DELIVERY (Development Mock Provider)          │');
    console.log('├────────────────────────────────────────────────────────┤');
    console.log(`│ To:       ${options.to.padEnd(44)} │`);
    console.log(`│ Subject:  ${options.subject.slice(0, 44).padEnd(44)} │`);
    console.log('│ Body:                                                  │');
    const lines = options.body.split('\n');
    for (const line of lines.slice(0, 3)) {
      console.log(`│   ${line.slice(0, 52).padEnd(52)} │`);
    }
    console.log('└────────────────────────────────────────────────────────┘\n');

    return {
      messageId: `mock_email_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      provider: this.name,
      delivered: true,
      latencyMs: Date.now() - start,
      statusCode: 200,
    };
  }

  getSentEmails(): EmailSendOptions[] {
    return [...this.sentMails];
  }

  clearSentEmails(): void {
    this.sentMails = [];
  }

}

export function getResendSenderEmail(): string | undefined {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.RESEND_EMAIL_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    undefined
  );
}

export function resolveEmailProvider(): EmailProvider {
  const configured = (process.env.EMAIL_PROVIDER || 'mock').trim().toLowerCase();

  if (configured === 'mock') {
    return new MockEmailProvider();
  }

  if (configured === 'resend') {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = getResendSenderEmail();

    if (!apiKey) {
      throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY to be configured.');
    }
    if (!from) {
      throw new Error('EMAIL_PROVIDER=resend requires RESEND_FROM_EMAIL (or RESEND_EMAIL_FROM / EMAIL_FROM) to be configured.');
    }

    return new ResendEmailProvider({
      apiKey,
      from,
      fromName: process.env.RESEND_FROM_NAME?.trim() || undefined,
    });
  }

  throw new Error(
    `Unsupported EMAIL_PROVIDER="${configured}". Supported values are "mock" and "resend".`
  );
}

let activeEmailProvider: EmailProvider = resolveEmailProvider();

export function getEmailProvider(): EmailProvider {
  return activeEmailProvider;
}

export function setEmailProvider(provider: EmailProvider): void {
  activeEmailProvider = provider;
}
