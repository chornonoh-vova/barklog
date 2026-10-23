import type { BacklogListItemWire, BacklogSort } from "@repo/contracts";

/** `ORDER_BY` in `packages/db/src/queries/backlog.ts`, game id breaking ties.
 * Unrated sorts as 0, below `RATING_MIN`, matching `NULLS LAST`. */
export function compare(sort: BacklogSort, a: BacklogListItemWire, b: BacklogListItemWire): number {
  const primary =
    sort === "updated_at"
      ? b.updatedAt.localeCompare(a.updatedAt)
      : sort === "added_at"
        ? b.addedAt.localeCompare(a.addedAt)
        : sort === "rating"
          ? (b.rating ?? 0) - (a.rating ?? 0)
          : a.game.name.localeCompare(b.game.name);

  return primary !== 0 ? primary : a.gameId - b.gameId;
}
