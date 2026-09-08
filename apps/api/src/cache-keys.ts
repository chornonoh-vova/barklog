import { createHash } from "node:crypto";

import type { GameFeed } from "@repo/contracts";

import type { NormalisedShare } from "./share/normalise.js";
import type { SourceMeta } from "./share/oembed.js";
import { startOfUtcDay } from "@repo/db";

export { SEARCH_VERSION_KEY } from "@repo/cache";

export const SEARCH_TTL_SECONDS = 600;
export const EMPTY_SEARCH_TTL_SECONDS = 60;
export const FEED_TTL_SECONDS = 3600;

export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function searchKey(version: number, query: string, limit: number, offset: number): string {
  return `search:v${version}:${sha1(`${query}|${limit}|${offset}`)}`;
}

/** Day-bucketed: the release windows move at midnight, so a feed cached at
 * 23:59 would otherwise serve yesterday's window for a full TTL. */
export function feedKey(feed: GameFeed, version: number, limit: number, now: Date): string {
  return `${feed}:v${version}:${startOfUtcDay(now).toISOString().slice(0, 10)}:${limit}`;
}

export const SIMILAR_TTL_SECONDS = 3600;

export function similarKey(version: number, gameId: number, limit: number): string {
  return `similar:v${version}:${gameId}:${limit}`;
}

/** A source's title effectively never changes. */
export const SOURCE_TTL_SECONDS = 604_800;

/**
 * Takes the whole `NormalisedShare`, not a bare id: this cache keys on the
 * REQUESTED url's id, `extractKey` below keys on the POST-REDIRECT one, and
 * the two are only distinguishable here because the parameter types are.
 */
export function sourceKey(share: NormalisedShare): string {
  // `v3`: the cached value is a `SourceMeta`, keyed by shareId rather than
  // provider/videoId so any https link — not just the two hand-rolled
  // providers — can share the cache.
  return `oembed:v3:${share.shareId}`;
}

/**
 * 30 days is its own budget, not derived from `SOURCE_TTL_SECONDS` above. The
 * key already encodes everything the answer depends on — prompt version,
 * model, and source metadata — so a cached extraction cannot go stale under it.
 */
export const EXTRACT_TTL_SECONDS = 2_592_000;

/**
 * Both the prompt version and the model belong in the key: either one changing
 * changes the answer, and a 30-day TTL outlives several deploys.
 */
export function extractKey(promptVersion: number, model: string, meta: SourceMeta): string {
  return `extract:v${promptVersion}:${model}:${meta.shareId}`;
}
