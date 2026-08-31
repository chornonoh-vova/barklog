import { getLogger } from "@logtape/logtape";
// Named import: iovalkey is CJS and its default export is not constructable here.
import { Valkey } from "iovalkey";

const log = getLogger(["cache"]);

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  incr(key: string): Promise<number | null>;
  /** New count, or `null` when Valkey is unreachable. */
  incrAndExpire(key: string, ttlSeconds: number): Promise<number | null>;
  ttlSeconds(key: string): Promise<number | null>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createCache(url: string): Cache {
  const client = new Valkey(url, {
    // No `lazyConnect`: the first command would race the connection and be rejected.
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
    retryStrategy: () => null,
  });

  // Required: without a listener the client throws on unhandled 'error' events.
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
