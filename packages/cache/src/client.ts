import { getLogger } from "@logtape/logtape";
// Named import, not default: iovalkey is CJS, and under NodeNext its default
// export is not constructable from an ESM module.
import { Valkey } from "iovalkey";

// Depends on @logtape/logtape directly, not @repo/logging: configuration is
// per-process and belongs to the app, not to a library, so this package must
// only ever obtain a logger, never configure one. An unconfigured LogTape
// drops records rather than throwing, so this is safe in any consumer that
// has not configured logging.
const log = getLogger(["cache"]);

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  incr(key: string): Promise<number | null>;
  /**
   * `INCR` plus `EXPIRE` in one transaction. Returns the new count, or `null`
   * when Valkey is unreachable — which the rate limiter reads as "fail open".
   */
  incrAndExpire(key: string, ttlSeconds: number): Promise<number | null>;
  /** Remaining TTL in seconds, or `null` if the key is missing or Valkey is down. */
  ttlSeconds(key: string): Promise<number | null>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Every operation swallows connection errors and degrades to "no cache". The
 * cache holds nothing that cannot be recomputed, so a Valkey outage must cost
 * latency and nothing else.
 */
export function createCache(url: string): Cache {
  const client = new Valkey(url, {
    // Connect eagerly. With `lazyConnect` plus a disabled offline queue, the
    // very first command races the connection and is rejected outright — the
    // healthy path would fail open just as readily as a dead server.
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
    // One shot, no reconnect loop: an unreachable Valkey must surface as a
    // rejected command quickly so the caller can fall through to Postgres.
    retryStrategy: () => null,
  });

  // Without a listener, ioredis-style clients throw on unhandled 'error' events.
  client.on("error", (error: Error) => {
    log.warning("{message}", { message: error.message });
  });

  async function failOpen<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      log.warning("degraded: {message}", { message: (error as Error).message });
      return fallback;
    }
  }

  return {
    get: <T>(key: string) =>
      failOpen<T | null>(async () => {
        const raw = await client.get(key);
        return raw === null ? null : (JSON.parse(raw) as T);
      }, null),

    set: (key, value, ttlSeconds) =>
      failOpen(async () => {
        if (ttlSeconds <= 0) return;
        await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
      }, undefined),

    incr: (key) => failOpen<number | null>(() => client.incr(key), null),

    incrAndExpire: (key, ttlSeconds) =>
      failOpen<number | null>(async () => {
        // The window number is part of the key, so re-arming the TTL on every
        // hit cannot slide the window — it only keeps a dead key from leaking.
        const results = await client.multi().incr(key).expire(key, ttlSeconds).exec();
        const first = results?.[0];
        if (!first) return null;

        const [error, value] = first;
        if (error) throw error;

        return Number(value);
      }, null),

    ttlSeconds: (key) =>
      failOpen<number | null>(async () => {
        const ttl = await client.ttl(key);
        return ttl < 0 ? null : ttl;
      }, null),

    ping: () => failOpen(async () => (await client.ping()) === "PONG", false),

    close: async () => {
      await failOpen(async () => {
        client.disconnect();
      }, undefined);
    },
  };
}
