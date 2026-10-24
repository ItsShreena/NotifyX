import net from 'net';
import { Redis } from 'ioredis';

export interface RedisConnConfig {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
  enableReadyCheck: boolean;
}

/**
 * Parses Redis connection options strictly from environment variables.
 * Never hardcodes credentials.
 */
export function getRedisConnectionOptions(): RedisConnConfig {
  if (process.env.REDIS_URL) {
    try {
      const parsed = new URL(process.env.REDIS_URL);
      return {
        host: parsed.hostname || '127.0.0.1',
        port: Number(parsed.port) || 6379,
        password: parsed.password || undefined,
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
      };
    } catch {
      // Fallback if URL parsing fails
    }
  }

  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  };
}

/**
 * Non-blocking, error-safe TCP probe to check if a Redis server is listening.
 * Avoids uncaught ECONNREFUSED errors and endless socket reconnection loops.
 */
export function isRedisReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const opts = getRedisConnectionOptions();
    const socket = net.createConnection({
      host: opts.host,
      port: opts.port,
      timeout: 1000,
    });

    let resolved = false;
    const finish = (result: boolean) => {
      if (!resolved) {
        resolved = true;
        try {
          socket.destroy();
        } catch {
          // Ignore destroy errors
        }
        resolve(result);
      }
    };

    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

let clientInstance: Redis | null = null;

export function getRedisClient(): Redis | null {
  const opts = getRedisConnectionOptions();
  if (!clientInstance) {
    try {
      clientInstance = new Redis({
        ...opts,
        lazyConnect: true,
        maxRetriesPerRequest: null,
        retryStrategy: () => null, // Do not endlessly retry on failure
      });

      clientInstance.on('error', () => {
        // Handled silently to prevent process crash
      });
    } catch {
      return null;
    }
  }
  return clientInstance;
}

export async function checkRedisHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
  host: string;
  port: number;
  engine: string;
  error?: string;
}> {
  const opts = getRedisConnectionOptions();
  const start = Date.now();

  const reachable = await isRedisReachable();
  if (!reachable) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      host: opts.host || '127.0.0.1',
      port: Number(opts.port) || 6379,
      engine: 'Embedded Async Memory Queue (Active)',
      error: 'External Redis not detected. Fallback async queue engine active.',
    };
  }

  try {
    const client = getRedisClient();
    if (!client) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        host: opts.host,
        port: opts.port,
        engine: 'Embedded Async Memory Queue',
        error: 'Redis client initialization failed',
      };
    }

    if (client.status !== 'ready') {
      await client.connect();
    }
    const pong = await client.ping();
    const latencyMs = Date.now() - start;

    return {
      connected: pong === 'PONG',
      latencyMs,
      host: opts.host,
      port: opts.port,
      engine: 'BullMQ + Redis Server',
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      host: opts.host,
      port: opts.port,
      engine: 'Embedded Async Memory Queue (Active)',
      error: err.message || 'Connection refused',
    };
  }
}
