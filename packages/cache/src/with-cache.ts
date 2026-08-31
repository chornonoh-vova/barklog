import type { Cache } from "./client.js";

/**
 * Read-through caching. No negative caching: a `load` resolving to `null` is
 * indistinguishable from a miss and so is never cached — wrap the value
 * (e.g. `{ value: T | null }`) if you need that.
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
