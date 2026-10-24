import { z } from 'zod';
import { GoogleGenAI, Type } from '@google/genai';

export const AI_ALLOWED_CATEGORIES = [
  'SECURITY',
  'PAYMENT',
  'ORDER',
  'COMMENT',
  'TASK',
  'DEPLOYMENT',
  'REMINDER',
  'SYSTEM',
  'MARKETING',
] as const;

export type AICategory = (typeof AI_ALLOWED_CATEGORIES)[number];

export const AI_ALLOWED_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;

export type AIPriority = (typeof AI_ALLOWED_PRIORITIES)[number];

export const AIResponseSchema = z.object({
  category: z.enum(AI_ALLOWED_CATEGORIES),
  priority: z.enum(AI_ALLOWED_PRIORITIES),
  summary: z.string().nullable().optional(),
  shouldGroup: z.boolean(),
});

export type ValidatedAIOutput = z.infer<typeof AIResponseSchema>;

export interface AIAnalysisResult {
  category: AICategory;
  priority: AIPriority;
  summary: string | null;
  shouldGroup: boolean;
  requestedPriority?: string;
  aiSuggestedPriority: AIPriority;
  finalPriority: string;
  finalCategory: string;
  isFallback: boolean;
  fallbackReason?: string;
  processedAt: Date;
}

export interface NotificationInputForAI {
  title: string;
  message: string;
  type?: string;
  priority?: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Sanitizes input text before sending to any LLM:
 * Strips out sensitive credentials, authorization headers, passwords, and secrets.
 */
export function sanitizePromptText(text: string): string {
  if (!text) return '';
  return text
    // Redact Bearer / JWT tokens
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, '[REDACTED_JWT]')
    // Redact password fields (e.g. password: "xyz" or pwd=xyz)
    .replace(/(?:password|passwd|pwd|secret)\s*[:=]\s*["']?[^"'\s]+["']?/gi, 'password=[REDACTED]')
    // Redact API keys (e.g. nx_live_..., sk_..., key_..., AIza..., AQ...)
    .replace(/(?:nx_live_|nx_test_|sk_live_|sk_test_|key_)[A-Za-z0-9_]{16,}/gi, '[REDACTED_API_KEY]')
    .replace(/(?:AIza|AQ)[A-Za-z0-9\-_]{20,}/gi, '[REDACTED_API_KEY]')
    // Redact credit card numbers (13-19 digits with optional spaces/hyphens)
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD]');
}

export class AIService {
  private customMockHandler?: (input: NotificationInputForAI) => Promise<ValidatedAIOutput | null>;

  /**
   * Allows automated tests to inject mock AI behavior without real external API calls.
   */
  setMockHandler(handler?: (input: NotificationInputForAI) => Promise<ValidatedAIOutput | null>) {
    this.customMockHandler = handler;
  }

  /**
   * Main entrypoint: Intelligently classifies, prioritizes, summarizes, and groups notifications.
   * Guaranteed to never throw: on any model error or timeout, safely falls back to business logic.
   */
  async analyzeNotification(input: NotificationInputForAI): Promise<AIAnalysisResult> {
    const requestedPriority = (input.priority || 'normal').toLowerCase();
    const requestedType = (input.type || 'SYSTEM').toUpperCase();

    // 1. Check if custom mock handler is active (e.g., during automated unit tests)
    if (this.customMockHandler) {
      try {
        const mockOutput = await this.customMockHandler(input);
        if (mockOutput) {
          const validated = AIResponseSchema.parse(mockOutput);
          return this.reconcileSafetyRules(input, validated, false);
        }
      } catch (mockErr: any) {
        return this.createFallbackResult(input, `Mock error: ${mockErr.message}`);
      }
    }

    // 2. Obtain configuration from environment variables
    const baseUrl = process.env.AI_BASE_URL;
    // For GoogleGenAI, strictly prioritize GEMINI_API_KEY.
    // Avoid passing third-party keys (e.g. OpenRouter 'sk-or-...') to Google's API endpoint.
    let apiKey: string | undefined;
    if (baseUrl) {
      apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY;
    } else {
      apiKey = process.env.GEMINI_API_KEY || (process.env.AI_API_KEY && !process.env.AI_API_KEY.startsWith('sk-') ? process.env.AI_API_KEY : undefined);
    }

    const model = process.env.AI_MODEL || 'gemini-2.5-flash';

    // If AI is completely unconfigured or disabled, use deterministic local NLP rules
    if (!apiKey) {
      const localResult = this.heuristicClassification(input);
      return this.reconcileSafetyRules(input, localResult, true, 'AI provider unconfigured (running on local heuristic intelligence engine)');
    }

    // 3. Attempt external AI call with strict timeout (4 seconds max)
    try {
      let rawOutput: unknown;

      if (baseUrl) {
        // OpenAI-compatible endpoint route
        rawOutput = await this.callOpenAICompatibleAPI(input, apiKey, model, baseUrl);
      } else {
        // Gemini API route
        rawOutput = await this.callGeminiAPI(input, apiKey, model);
      }

      // 4. Validate output with strict Zod schema
      const normalized = this.normalizeRawOutput(rawOutput);
      const validated = AIResponseSchema.parse(normalized);
      return this.reconcileSafetyRules(input, validated, false);
    } catch (err: any) {
      console.warn('⚠️ [AIService] Model call failed or returned invalid schema. Invoking safe fallback:', err.message);
      return this.createFallbackResult(input, err.message);
    }
  }

  /**
   * Normalizes category and priority strings to ensure valid schema parsing.
   */
  private normalizeRawOutput(raw: any): any {
    if (!raw || typeof raw !== 'object') return raw;

    let cat = String(raw.category || '').toUpperCase().trim();
    if (cat.includes('PAY') || cat.includes('BILL') || cat.includes('INVOICE') || cat.includes('CARD')) cat = 'PAYMENT';
    else if (cat.includes('SEC') || cat.includes('AUTH') || cat.includes('PASS') || cat.includes('LOGIN')) cat = 'SECURITY';
    else if (cat.includes('ORD') || cat.includes('SHIP') || cat.includes('DELIV') || cat.includes('TRACK')) cat = 'ORDER';
    else if (cat.includes('COMM') || cat.includes('REPL') || cat.includes('MENTION')) cat = 'COMMENT';
    else if (cat.includes('TASK') || cat.includes('JIRA') || cat.includes('SPRINT') || cat.includes('TICKET')) cat = 'TASK';
    else if (cat.includes('DEP') || cat.includes('BUILD') || cat.includes('RELEASE')) cat = 'DEPLOYMENT';
    else if (cat.includes('REMIND') || cat.includes('DUE') || cat.includes('CALENDAR')) cat = 'REMINDER';
    else if (cat.includes('MARKET') || cat.includes('PROMO') || cat.includes('NEWS')) cat = 'MARKETING';
    else if (!AI_ALLOWED_CATEGORIES.includes(cat as any)) cat = 'SYSTEM';

    let pri = String(raw.priority || '').toLowerCase().trim();
    if (!AI_ALLOWED_PRIORITIES.includes(pri as any)) {
      if (pri.includes('crit') || pri.includes('emerg') || pri.includes('urgent')) pri = 'critical';
      else if (pri.includes('high')) pri = 'high';
      else if (pri.includes('low')) pri = 'low';
      else pri = 'normal';
    }

    return {
      ...raw,
      category: cat,
      priority: pri,
      shouldGroup: Boolean(raw.shouldGroup),
      summary: typeof raw.summary === 'string' ? raw.summary : null,
    };
  }

  /**
   * Calls Google Gemini API using structured response JSON schema.
   */
  private async callGeminiAPI(
    input: NotificationInputForAI,
    apiKey: string,
    modelName: string
  ): Promise<unknown> {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const sanitizedTitle = sanitizePromptText(input.title);
    const sanitizedMsg = sanitizePromptText(input.message);

    const prompt = `Analyze this notification and respond strictly with JSON:
Title: "${sanitizedTitle}"
Message: "${sanitizedMsg}"
Original Category Hint: "${input.type || 'none'}"
Original Priority Hint: "${input.priority || 'none'}"`;

    const systemInstruction = `You are an AI Notification Intelligence analyzer for NotifyX.
Your task is to classify notifications into exactly one category, determine priority, generate a concise summary if beneficial, and evaluate grouping.

Categories allowed:
- SECURITY: Auth, logins, password resets, suspicious activity, API credentials
- PAYMENT: Invoices, receipts, failed payments, charges, cards
- ORDER: Shipments, delivery, tracking, returns, packaging
- COMMENT: Replies, mentions, social thread notifications
- TASK: Sprints, Jira tickets, assigned tasks, project milestones
- DEPLOYMENT: CI/CD, production releases, build status, canary
- REMINDER: Calendar events, deadlines, schedules
- SYSTEM: Platform maintenance, server degradation, service alerts
- MARKETING: Product updates, newsletters, promos

Priorities allowed:
- critical: Immediate action or security/financial emergency (e.g. account hacked, high-value fraud)
- high: Urgent business issue or payment failure
- normal: Standard operational events (e.g. order shipped, task assigned)
- low: Informational or non-urgent updates (e.g. newsletter, comment)

Summary rules:
- Provide a short, factual 1-sentence summary under 80 characters, or null if message is already very short.
- Preserve key numbers, amounts, IDs, and dates. Never hallucinate.

Grouping:
- Set shouldGroup=true for repetitive, low/normal priority notifications (like comments, minor task edits).
- Set shouldGroup=false for security, payments, critical alerts, or unique high-priority items.`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI request timed out after 4000ms')), 4000)
    );

    const requestPromise = ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              enum: [
                'SECURITY',
                'PAYMENT',
                'ORDER',
                'COMMENT',
                'TASK',
                'DEPLOYMENT',
                'REMINDER',
                'SYSTEM',
                'MARKETING',
              ],
              description: 'Canonical notification category in UPPERCASE',
            },
            priority: {
              type: Type.STRING,
              enum: ['low', 'normal', 'high', 'critical'],
              description: 'Notification priority: low, normal, high, or critical',
            },
            summary: {
              type: Type.STRING,
              description: 'Concise summary or null',
            },
            shouldGroup: {
              type: Type.BOOLEAN,
              description: 'Whether similar notifications can be batched/grouped',
            },
          },
          required: ['category', 'priority', 'shouldGroup'],
        },
      },
    });

    const response = await Promise.race([requestPromise, timeoutPromise]);
    const text = response.text?.trim() || '{}';
    return JSON.parse(text);
  }

  /**
   * Calls an OpenAI-compatible completion endpoint if AI_BASE_URL is configured.
   */
  private async callOpenAICompatibleAPI(
    input: NotificationInputForAI,
    apiKey: string,
    modelName: string,
    baseUrl: string
  ): Promise<unknown> {
    const sanitizedTitle = sanitizePromptText(input.title);
    const sanitizedMsg = sanitizePromptText(input.message);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'You are an AI notification classifier. Return JSON with keys: category (one of SECURITY, PAYMENT, ORDER, COMMENT, TASK, DEPLOYMENT, REMINDER, SYSTEM, MARKETING), priority (one of low, normal, high, critical), summary (short string or null), shouldGroup (boolean).',
            },
            {
              role: 'user',
              content: `Title: ${sanitizedTitle}\nMessage: ${sanitizedMsg}`,
            },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`OpenAI-compatible HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || '{}';
      return JSON.parse(content);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Deterministic local heuristic intelligence engine used when external AI is offline or unconfigured.
   * Completely local, zero latency, guaranteed valid schema.
   */
  heuristicClassification(input: NotificationInputForAI): ValidatedAIOutput {
    const fullText = `${input.title} ${input.message} ${input.type || ''}`.toLowerCase();

    let category: AICategory = 'SYSTEM';
    let priority: AIPriority = 'normal';
    let shouldGroup = false;

    // Category detection rules
    if (
      fullText.includes('password') ||
      fullText.includes('login') ||
      fullText.includes('device') ||
      fullText.includes('suspicious') ||
      fullText.includes('auth') ||
      fullText.includes('security') ||
      fullText.includes('breach') ||
      fullText.includes('unauthorized')
    ) {
      category = 'SECURITY';
      priority = fullText.includes('suspicious') || fullText.includes('breach') ? 'critical' : 'high';
      shouldGroup = false;
    } else if (
      fullText.includes('payment') ||
      fullText.includes('invoice') ||
      fullText.includes('receipt') ||
      fullText.includes('charge') ||
      fullText.includes('bill') ||
      fullText.includes('card') ||
      fullText.includes('refund') ||
      fullText.includes('declined')
    ) {
      category = 'PAYMENT';
      priority = fullText.includes('fail') || fullText.includes('declined') ? 'high' : 'normal';
      shouldGroup = false;
    } else if (
      fullText.includes('order') ||
      fullText.includes('shipped') ||
      fullText.includes('delivery') ||
      fullText.includes('tracking') ||
      fullText.includes('courier') ||
      fullText.includes('package')
    ) {
      category = 'ORDER';
      priority = 'normal';
      shouldGroup = false;
    } else if (
      fullText.includes('comment') ||
      fullText.includes('replied') ||
      fullText.includes('mentioned') ||
      fullText.includes('thread')
    ) {
      category = 'COMMENT';
      priority = 'low';
      shouldGroup = true;
    } else if (
      fullText.includes('task') ||
      fullText.includes('sprint') ||
      fullText.includes('jira') ||
      fullText.includes('ticket') ||
      fullText.includes('assigned')
    ) {
      category = 'TASK';
      priority = 'normal';
      shouldGroup = true;
    } else if (
      fullText.includes('deploy') ||
      fullText.includes('build') ||
      fullText.includes('release') ||
      fullText.includes('pipeline') ||
      fullText.includes('ci/cd')
    ) {
      category = 'DEPLOYMENT';
      priority = fullText.includes('fail') ? 'high' : 'normal';
      shouldGroup = false;
    } else if (
      fullText.includes('reminder') ||
      fullText.includes('deadline') ||
      fullText.includes('calendar') ||
      fullText.includes('due') ||
      fullText.includes('scheduled')
    ) {
      category = 'REMINDER';
      priority = 'normal';
      shouldGroup = false;
    } else if (
      fullText.includes('marketing') ||
      fullText.includes('newsletter') ||
      fullText.includes('promo') ||
      fullText.includes('discount') ||
      fullText.includes('offer')
    ) {
      category = 'MARKETING';
      priority = 'low';
      shouldGroup = true;
    }

    // Explicit override if input priority was critical
    if (input.priority?.toLowerCase() === 'critical') {
      priority = 'critical';
    }

    // Generate concise summary
    let summary: string | null = null;
    if (input.message.length > 50) {
      const firstSentence = input.message.split(/[.!?]/)[0]?.trim();
      summary = firstSentence ? `${firstSentence}.` : input.title;
    } else {
      summary = input.message;
    }

    return {
      category,
      priority,
      summary,
      shouldGroup,
    };
  }

  /**
   * SECTION 6: IMPORTANT SAFETY RULE
   * Distinguish between requestedPriority and aiSuggestedPriority.
   * AI can NEVER downgrade an explicit 'critical' priority from external application.
   * Backend business rules govern the final priority and final category.
   */
  private reconcileSafetyRules(
    input: NotificationInputForAI,
    aiOutput: ValidatedAIOutput,
    isFallback: boolean,
    fallbackReason?: string
  ): AIAnalysisResult {
    const requestedPriority = (input.priority || 'normal').toLowerCase();
    const aiSuggestedPriority = aiOutput.priority;

    let finalPriority = aiSuggestedPriority as string;

    // Rule 1: If requested priority was critical, never downgrade it
    if (requestedPriority === 'critical') {
      finalPriority = 'critical';
    } else if (requestedPriority === 'high' && (aiSuggestedPriority === 'low' || aiSuggestedPriority === 'normal')) {
      // Rule 2: Explicit high priority is preserved unless AI elevated to critical
      finalPriority = 'high';
    } else if (aiSuggestedPriority === 'critical') {
      // Rule 3: If AI detects critical risk (e.g. account hijacked), elevate for safety
      finalPriority = 'critical';
    }

    // Final Category resolution:
    // If AI classification is valid, use AI category; otherwise keep normalized application type
    const finalCategory = aiOutput.category;

    return {
      category: aiOutput.category,
      priority: aiOutput.priority,
      summary: aiOutput.summary || null,
      shouldGroup: aiOutput.shouldGroup,
      requestedPriority,
      aiSuggestedPriority,
      finalPriority,
      finalCategory,
      isFallback,
      fallbackReason,
      processedAt: new Date(),
    };
  }

  /**
   * SECTION 10: AI FAILURE HANDLING
   * Fallback behavior when AI fails or returns invalid response:
   * 1. Use application-provided category if available
   * 2. Use application-provided priority if available
   * 3. Otherwise use sensible defaults (SYSTEM, normal)
   * 4. Continue notification processing
   */
  createFallbackResult(input: NotificationInputForAI, reason: string): AIAnalysisResult {
    const local = this.heuristicClassification(input);

    // 1. Resolve Category: App-provided > Heuristic > SYSTEM
    let finalCategory: AICategory = 'SYSTEM';
    const rawType = (input.type || '').toUpperCase();
    if (rawType && AI_ALLOWED_CATEGORIES.includes(rawType as AICategory)) {
      finalCategory = rawType as AICategory;
    } else {
      finalCategory = local.category;
    }

    // 2. Resolve Priority: App-provided > Heuristic > normal
    const requestedPriority = (input.priority || '').toLowerCase();
    let finalPriority: AIPriority = 'normal';
    if (requestedPriority && AI_ALLOWED_PRIORITIES.includes(requestedPriority as AIPriority)) {
      finalPriority = requestedPriority as AIPriority;
    } else {
      finalPriority = local.priority;
    }

    return {
      category: finalCategory,
      priority: finalPriority,
      summary: local.summary || null,
      shouldGroup: local.shouldGroup,
      requestedPriority: requestedPriority || undefined,
      aiSuggestedPriority: local.priority,
      finalPriority,
      finalCategory,
      isFallback: true,
      fallbackReason: sanitizePromptText(reason),
      processedAt: new Date(),
    };
  }
}

export const aiService = new AIService();
