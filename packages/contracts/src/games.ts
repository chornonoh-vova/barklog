import * as v from "valibot";

import { integerFrom } from "./coerce.js";

export const SEARCH_QUERY_MIN = 2;
export const SEARCH_QUERY_MAX = 100;
export const SEARCH_LIMIT_MAX = 50;
export const SEARCH_OFFSET_MAX = 200;
export const SEARCH_LIMIT_DEFAULT = 20;

/**
 * `games.id` and `backlog_entries.game_id` are Postgres `integer` (int4) columns
 * (see `packages/db/src/schema/mirror.ts`), not `bigint`. Without this bound, an
 * id above int4 range reaches the query layer and Postgres rejects it, which
 * surfaces as a 500 with a stack trace rather than a 422 — and, worse, is a
 * cost a client can trigger at will on the `error` log level that 4xx handling
 * was deliberately kept off of. A change to either the column type or this
 * constant must change the other.
 */
export const MAX_GAME_ID = 2_147_483_647;

const gameId = integerFrom(1, MAX_GAME_ID);

export const searchQuerySchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(SEARCH_QUERY_MIN), v.maxLength(SEARCH_QUERY_MAX)),
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SEARCH_LIMIT_DEFAULT),
  offset: v.optional(integerFrom(0, SEARCH_OFFSET_MAX), 0),
});
export type SearchQuery = v.InferOutput<typeof searchQuerySchema>;

/** Shared by `/popular`, `/upcoming` and `/recent` — a limit is all they take. */
export const gameFeedQuerySchema = v.object({
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SEARCH_LIMIT_DEFAULT),
});
export type GameFeedQuery = v.InferOutput<typeof gameFeedQuerySchema>;

/** `GET /api/games/:id` */
export const gameIdParamSchema = v.object({ id: gameId });

/** `PUT`/`DELETE /api/backlog/:gameId` */
export const gameIdPathSchema = v.object({ gameId });
