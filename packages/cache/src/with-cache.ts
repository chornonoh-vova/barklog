import type { Cache } from "./client.js";

/**
 * Read-through caching. `ttl` may be a function of the loaded value, which is
 * how an empty search result gets a shorter TTL than a populated one (spec §10).
 *
 * Because the cache fails open, a Valkey outage degrades this to a direct call
 * to `load` — never to an error.
 */
export async function withCache<T>(
  cache: Cache,
  key: string,
  ttl: number | ((value: T) => number),
  load: () => Promise<T>,
): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== null) return hit;

  const value = await load();
  await cache.set(key, value, typeof ttl === "number" ? ttl : ttl(value));

  return value;
}
