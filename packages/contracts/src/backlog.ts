import * as v from "valibot";

/**
 * The single source of truth for the status union. `packages/db` declares the
 * same list for its Postgres enum; `test/status-parity.test.ts` over there
 * fails if the two ever drift.
 */
export const BACKLOG_STATUSES = ["waiting", "playing", "completed", "abandoned"] as const;
export type BacklogStatus = (typeof BACKLOG_STATUSES)[number];

export const backlogStatusSchema = v.picklist(BACKLOG_STATUSES);

export const BACKLOG_SORTS = ["updated_at", "added_at", "rating", "name"] as const;
export type BacklogSort = (typeof BACKLOG_SORTS)[number];

export const RATING_MIN = 1;
export const RATING_MAX = 10;

export const backlogListQuerySchema = v.object({
  status: v.optional(backlogStatusSchema),
  sort: v.optional(v.picklist(BACKLOG_SORTS), "updated_at"),
});
export type BacklogListQuery = v.InferOutput<typeof backlogListQuerySchema>;

/**
 * Strict: an entry is exactly two fields, and `PUT` is a full replace, so an
 * unrecognised key is a client bug worth surfacing rather than dropping.
 * `rating: null` is the client clearing a rating it set earlier.
 */
export const backlogUpsertSchema = v.strictObject({
  status: backlogStatusSchema,
  rating: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(RATING_MIN), v.maxValue(RATING_MAX))),
  ),
});
export type BacklogUpsert = v.InferOutput<typeof backlogUpsertSchema>;
