import type { Cache } from "./client.js";

/**
 * Read-through caching. `ttl` may be a function of the loaded value, which is
 * how an empty search result gets a shorter TTL than a populated one (spec §10).
 *
 * Because the cache fails open, a Valkey outage degrades this to a direct call
 * to `load` — never to an error.
 *
 * No negative caching: `hit !== null` cannot tell "this key holds a cached
 * `null`" apart from "this key is absent", so a `load` that legitimately
 * resolves to `null` is re-run and re-stored on every call and never actually
 * gets cached. Nothing in this repo hits that today — game details are
 * deliberately uncached (spec §8, §10) and the two cached loaders both return
 * arrays — but a future caller needing to cache a `null` result must wrap the
 * value (e.g. `{ value: T | null }`) rather than relying on this helper.
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
