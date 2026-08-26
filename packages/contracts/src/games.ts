import * as v from "valibot";

import { integerFrom } from "./coerce.js";

export const SEARCH_QUERY_MIN = 2;
export const SEARCH_QUERY_MAX = 100;
export const SEARCH_LIMIT_MAX = 50;
export const SEARCH_OFFSET_MAX = 200;
export const SEARCH_LIMIT_DEFAULT = 20;

const gameId = integerFrom(1, Number.MAX_SAFE_INTEGER);

export const searchQuerySchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(SEARCH_QUERY_MIN), v.maxLength(SEARCH_QUERY_MAX)),
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SEARCH_LIMIT_DEFAULT),
  offset: v.optional(integerFrom(0, SEARCH_OFFSET_MAX), 0),
});
export type SearchQuery = v.InferOutput<typeof searchQuerySchema>;

export const popularQuerySchema = v.object({
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SEARCH_LIMIT_DEFAULT),
});
export type PopularQuery = v.InferOutput<typeof popularQuerySchema>;

/** `GET /api/games/:id` */
export const gameIdParamSchema = v.object({ id: gameId });

/** `PUT`/`DELETE /api/backlog/:gameId` */
export const gameIdPathSchema = v.object({ gameId });
