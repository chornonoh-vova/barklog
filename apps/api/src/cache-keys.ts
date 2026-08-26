import { createHash } from "node:crypto";

/**
 * A counter, not a key list. The sync runs `INCR` on it, and every key from the
 * previous version becomes unreachable at once and expires on its own — no key
 * scanning, and no way to miss an invalidation.
 */
export const SEARCH_VERSION_KEY = "search:ver";

export const SEARCH_TTL_SECONDS = 600;
/** Shorter, because this is what absorbs the typo storm search-as-you-type makes. */
export const EMPTY_SEARCH_TTL_SECONDS = 60;
export const POPULAR_TTL_SECONDS = 3600;

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
