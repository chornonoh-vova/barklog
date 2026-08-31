import type { GameSummaryWire } from "../serialize.js";

/** Each guess is searched at this limit; three guesses give at most 24 rows in. */
export const PER_GUESS_LIMIT = 8;

/**
 * No scoring arithmetic. The guesses arrive ordered by the model, and
 * `searchGames` already ranks within a guess by similarity and popularity, so
 * concatenating in order and deduping is the whole ranking.
 */
export function mergeCandidates(results: GameSummaryWire[][], limit: number): GameSummaryWire[] {
  const seen = new Set<number>();
  const merged: GameSummaryWire[] = [];

  for (const group of results) {
    for (const item of group) {
      if (seen.has(item.id)) continue;

      seen.add(item.id);
      merged.push(item);

      if (merged.length === limit) return merged;
    }
  }

  return merged;
}
