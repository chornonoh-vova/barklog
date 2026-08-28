import { createHash } from "node:crypto";

// Re-exported from @repo/cache, which both this process and apps/worker
// depend on, so there is exactly one declaration shared by both — not a
// literal duplicated across processes that a typo could silently diverge.
export { SEARCH_VERSION_KEY } from "@repo/cache";

export const SEARCH_TTL_SECONDS = 600;
/** Shorter, because this is what absorbs the typo storm search-as-you-type makes. */
export const EMPTY_SEARCH_TTL_SECONDS = 60;
/** Shared by all three explore feeds, so their freshness cannot drift apart. */
export const FEED_TTL_SECONDS = 3600;

/** Trimmed, lowercased, internal whitespace collapsed — before hashing. */
export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function searchKey(version: number, query: string, limit: number, offset: number): string {
  return `search:v${version}:${sha1(`${query}|${limit}|${offset}`)}`;
}

export function popularKey(version: number, limit: number): string {
  return `popular:v${version}:${limit}`;
}

/**
 * The UTC day the release feeds partition on, in their key. Their window moves
 * at midnight, so without it a feed cached at 23:59 would keep serving
 * yesterday's boundary for the rest of its TTL. The cost is one miss a day.
 */
export function dayBucket(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function releaseFeedKey(
  feed: "upcoming" | "recent",
  version: number,
  limit: number,
  day: string,
): string {
  return `${feed}:v${version}:${day}:${limit}`;
}
