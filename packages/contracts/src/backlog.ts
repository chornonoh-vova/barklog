import * as v from "valibot";

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

export const backlogUpsertSchema = v.strictObject({
  status: backlogStatusSchema,
  rating: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(RATING_MIN), v.maxValue(RATING_MAX))),
  ),
});
export type BacklogUpsert = v.InferOutput<typeof backlogUpsertSchema>;
