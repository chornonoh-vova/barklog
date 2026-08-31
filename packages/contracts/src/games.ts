import * as v from "valibot";

import { integerFrom } from "./coerce.js";

export const SEARCH_QUERY_MIN = 2;
export const SEARCH_QUERY_MAX = 100;
export const SEARCH_LIMIT_MAX = 50;
export const SEARCH_OFFSET_MAX = 200;
export const SEARCH_LIMIT_DEFAULT = 20;

/** int4 upper bound; must track the `games.id` column type. */
export const MAX_GAME_ID = 2_147_483_647;

const gameId = integerFrom(1, MAX_GAME_ID);

export const searchQuerySchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(SEARCH_QUERY_MIN), v.maxLength(SEARCH_QUERY_MAX)),
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SEARCH_LIMIT_DEFAULT),
  offset: v.optional(integerFrom(0, SEARCH_OFFSET_MAX), 0),
});
export type SearchQuery = v.InferOutput<typeof searchQuerySchema>;

export type GameFeed = "popular" | "upcoming" | "recent";

export const gameFeedQuerySchema = v.object({
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SEARCH_LIMIT_DEFAULT),
});

export const gameIdParamSchema = v.object({ id: gameId });

export const gameIdPathSchema = v.object({ gameId });

export const SIMILAR_LIMIT_DEFAULT = 12;

export const similarQuerySchema = v.object({
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SIMILAR_LIMIT_DEFAULT),
});
