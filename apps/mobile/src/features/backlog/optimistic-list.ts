import type {
  BacklogListItemWire,
  BacklogListResponse,
  BacklogSort,
  BacklogStatus,
} from "@repo/contracts";

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

/**
 * A cached backlog list as it will look once a change lands, so Home moves or
 * drops the row at tap time instead of after the refetch. `next` is `null` for
 * a removal. A list without the game is returned as is: a summary-less game
 * cannot be added here, and the refetch brings it in.
 *
 * A changed row is re-placed by last update, the server's default order, not
 * left where it was: an edit bumps `updatedAt`, and a row that jumps when the
 * refetch lands reads as a second change. Only that row moves — the rest keep
 * the server's order.
 */
export function patchBacklogList(
  list: BacklogListResponse,
  gameId: number,
  next: { status: BacklogStatus; rating: number | null } | null,
  now: string,
): BacklogListResponse {
  const item = list.items.find((candidate) => candidate.gameId === gameId);
  if (item === undefined) return list;

  const rest = list.items.filter((candidate) => candidate.gameId !== gameId);
  if (next === null) return { ...list, items: rest };

  const changed = { ...item, ...next, updatedAt: now };
  const at = rest.findIndex((other) => compare("updated_at", changed, other) < 0);

  return {
    ...list,
    items: at === -1 ? [...rest, changed] : [...rest.slice(0, at), changed, ...rest.slice(at)],
  };
}
