import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var _prismaInstance: PrismaClient | undefined;
}

/**
 * Normalizes PostgreSQL connection string for connection poolers (Neon, Supabase, PgBouncer).
 * Appends pgbouncer=true, connect_timeout, and pool settings to prevent idle socket closures
 * ("Error in PostgreSQL connection: Error { kind: Closed, cause: None }").
 */
export function getNormalizedDatabaseUrl(rawUrl?: string): string | undefined {
  const url = rawUrl || process.env.DATABASE_URL;
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    const isPooler =
      parsed.hostname.includes('pooler') ||
      parsed.hostname.includes('neon.tech') ||
      parsed.searchParams.has('pgbouncer');

    if (isPooler) {
      parsed.searchParams.set('pgbouncer', 'true');
      if (!parsed.searchParams.has('connect_timeout')) {
        parsed.searchParams.set('connect_timeout', '15');
      }
      if (!parsed.searchParams.has('pool_timeout')) {
        parsed.searchParams.set('pool_timeout', '15');
      }
      if (!parsed.searchParams.has('connection_limit')) {
        parsed.searchParams.set('connection_limit', '10');
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

// Synchronously sync normalized URL into process.env if present
const normalizedDbUrl = getNormalizedDatabaseUrl();
if (normalizedDbUrl && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalizedDbUrl;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    datasources: normalizedDbUrl ? { db: { url: normalizedDbUrl } } : undefined,
    log:
      process.env.NODE_ENV === 'development'
        ? [
            { level: 'warn', emit: 'event' },
            { level: 'error', emit: 'event' },
          ]
        : [{ level: 'error', emit: 'event' }],
  });

  // Handle engine events gracefully to avoid noisy unhandled error dumps on idle pooler disconnects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).$on?.('error', (e: any) => {
    const msg = String(e?.message || e);
    if (msg.includes('kind: Closed') || msg.includes('Closed') || msg.includes('connection closed')) {
      console.warn('[Prisma] Pooled connection closed by remote gateway; reconnecting on demand.');
    } else {
      console.error('[Prisma Error]:', msg);
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).$on?.('warn', (e: any) => {
    console.warn('[Prisma Warning]:', e?.message || e);
  });

  return client;
}

/**
 * Prisma Client singleton instance.
 * Reuses client connection across dev reloads.
 */
export const prisma: PrismaClient = global._prismaInstance || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global._prismaInstance = prisma;
}

// Health check state cache to prevent query flooding & high roundtrip latency
let lastCheckTime = 0;
let cachedConnectionStatus = false;
let ongoingCheck: Promise<boolean> | null = null;
const HEALTH_CACHE_TTL_MS = 10000; // 10 seconds

/**
 * Helper to safely test PostgreSQL database connectivity with caching & timeouts.
 */
export async function isDatabaseConnected(forceFresh = false): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  const now = Date.now();
  if (!forceFresh && now - lastCheckTime < HEALTH_CACHE_TTL_MS) {
    return cachedConnectionStatus;
  }

  if (ongoingCheck) {
    return ongoingCheck;
  }

  ongoingCheck = (async () => {
    try {
      const pingQuery = prisma.$queryRaw`SELECT 1`;
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('DB ping timeout')), 4000)
      );
      await Promise.race([pingQuery, timeout]);
      cachedConnectionStatus = true;
      lastCheckTime = Date.now();
      return true;
    } catch {
      cachedConnectionStatus = false;
      lastCheckTime = Date.now();
      return false;
    } finally {
      ongoingCheck = null;
    }
  })();

  return ongoingCheck;
}

/**
 * Executes a Prisma query with automatic single retry on closed connection / socket reset.
 */
export async function withPrismaRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    const errorStr = String(err);
    const isConnClosed =
      errorStr.includes('kind: Closed') ||
      errorStr.includes('Connection closed') ||
      errorStr.includes('Closed') ||
      errorStr.includes('closed') ||
      errorStr.includes('connection reset') ||
      errorStr.includes('broken pipe');

    if (isConnClosed) {
      try {
        await prisma.$disconnect().catch(() => {});
        await prisma.$connect();
        return await fn();
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw err;
  }
}
