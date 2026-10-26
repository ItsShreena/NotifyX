import type { EmailProvider, EmailSendOptions, EmailSendResult } from './emailProvider.ts';

export interface ResendEmailProviderConfig {
  apiKey: string;
  from: string;
  fromName?: string;
  baseUrl?: string;
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'Resend';

  private readonly apiKey: string;
  private readonly from: string;
  private readonly fromName?: string;
  private readonly baseUrl: string;

  constructor(config: ResendEmailProviderConfig) {
    if (!config.apiKey?.trim()) {
      throw new Error('RESEND_API_KEY is required for the Resend provider.');
    }
    if (!config.from?.trim()) {
      throw new Error('RESEND_FROM_EMAIL is required for the Resend provider.');
    }

    this.apiKey = config.apiKey.trim();
    this.from = config.from.trim();
    this.fromName = config.fromName?.trim() || undefined;
    this.baseUrl = config.baseUrl || 'https://api.resend.com';
  }

  async sendEmail(options: EmailSendOptions): Promise<EmailSendResult> {
    const start = Date.now();
    const recipient = options.to.trim();
    const html = options.html || options.body.replace(/\n/g, '<br />');
    const fromAddress = this.fromName ? `${this.fromName} <${this.from}>` : this.from;

    try {
      const response = await fetch(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [recipient],
          subject: options.subject,
          html,
          text: options.body,
          reply_to: options.metadata?.replyTo as string | undefined,
        }),
      });

      const responseText = await response.text();
      let parsed: Record<string, unknown> | undefined;
      if (responseText) {
        try {
          parsed = JSON.parse(responseText) as Record<string, unknown>;
        } catch {
          parsed = { raw: responseText };
        }
      }

      if (!response.ok) {
        const message =
          (parsed && typeof parsed.message === 'string' && parsed.message) ||
          (parsed && typeof parsed.error === 'string' && parsed.error) ||
          responseText ||
          `Resend API returned HTTP ${response.status}`;

        return {
          messageId: '',
          provider: this.name,
          delivered: false,
          latencyMs: Date.now() - start,
          statusCode: response.status,
          error: message,
        };
      }

      const messageId =
        (typeof parsed?.id === 'string' && parsed.id) ||
        (typeof parsed?.data === 'object' && parsed.data && typeof (parsed.data as Record<string, unknown>).id === 'string'
          ? (parsed.data as Record<string, unknown>).id as string
          : '');

      return {
        messageId,
        provider: this.name,
        delivered: true,
        latencyMs: Date.now() - start,
        statusCode: response.status,
      };
    } catch (error: any) {
      return {
        messageId: '',
        provider: this.name,
        delivered: false,
        latencyMs: Date.now() - start,
        statusCode: 500,
        error: error?.message || 'Unknown Resend provider error',
      };
    }
  }
}
