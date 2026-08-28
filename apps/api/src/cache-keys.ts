import { createHash } from "node:crypto";

import type { GameFeed } from "@repo/contracts";
import { startOfUtcDay } from "@repo/db";

// Re-exported from @repo/cache, which both this process and apps/worker
// depend on, so there is exactly one declaration shared by both — not a
// literal duplicated across processes that a typo could silently diverge.
export { SEARCH_VERSION_KEY } from "@repo/cache";

export const SEARCH_TTL_SECONDS = 600;
/** Shorter, because this is what absorbs the typo storm search-as-you-type makes. */
export const EMPTY_SEARCH_TTL_SECONDS = 60;
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

/**
 * Day-bucketed off the boundary the queries themselves split on: the release
 * windows move at midnight, so without it a feed cached at 23:59 would serve
 * yesterday's window for the rest of its TTL.
 */
export function feedKey(feed: GameFeed, version: number, limit: number, now: Date): string {
  return `${feed}:v${version}:${startOfUtcDay(now).toISOString().slice(0, 10)}:${limit}`;
}
