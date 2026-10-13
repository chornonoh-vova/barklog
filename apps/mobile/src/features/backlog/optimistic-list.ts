import type { BacklogListResponse, BacklogStatus } from "@repo/contracts";

/** The list key's filter segment: a status, or `"all"` (see `keys.backlog.list`). */
export type BacklogListFilter = BacklogStatus | "all";

/**
 * A cached backlog list as it will look once a change lands, so Home moves or
 * drops the row at tap time instead of after the refetch. `next` is `null` for
 * a removal. A list without the game is returned as is: a summary-less game
 * cannot be added here, and the refetch brings it in.
 */
export function patchBacklogList(
  list: BacklogListResponse,
  filter: BacklogListFilter,
  gameId: number,
  next: { status: BacklogStatus; rating: number | null } | null,
  now: string,
): BacklogListResponse {
  if (!list.items.some((item) => item.gameId === gameId)) return list;

  const stays = next !== null && (filter === "all" || filter === next.status);

  return {
    ...list,
    items: stays
      ? list.items.map((item) =>
          item.gameId === gameId ? { ...item, ...next, updatedAt: now } : item,
        )
      : list.items.filter((item) => item.gameId !== gameId),
  };
}
