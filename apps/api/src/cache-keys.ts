import { createHash } from "node:crypto";

import type { GameFeed, ShareProviderName } from "@repo/contracts";
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

/** A published video's title effectively never changes. */
export const OEMBED_TTL_SECONDS = 604_800;

export function oembedKey(provider: ShareProviderName, videoId: string): string {
  return `oembed:${provider}:${videoId}`;
}

/** Deterministic given the metadata, and the metadata is cached for 7 days. */
export const EXTRACT_TTL_SECONDS = 2_592_000;

/**
 * Both the prompt version and the model belong in the key: either one changing
 * changes the answer, and a 30-day TTL outlives several deploys.
 */
export function extractKey(
  promptVersion: number,
  model: string,
  provider: string,
  videoId: string,
): string {
  return `extract:v${promptVersion}:${model}:${provider}:${videoId}`;
}
