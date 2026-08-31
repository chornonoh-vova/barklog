import type { BacklogSort, BacklogStatus, GameFeed } from "@repo/contracts";

/**
 * `stats` sits under the `backlog` namespace so that invalidating
 * `keys.backlog.all` sweeps the list and the counts together.
 */
export const keys = {
  games: {
    search: (q: string, limit: number, offset: number) =>
      ["games", "search", q, limit, offset] as const,
    feed: (feed: GameFeed, limit: number) => ["games", "feed", feed, limit] as const,
    detail: (id: number) => ["games", "detail", id] as const,
    /**
     * Deliberately not nested under `detail`: the backlog mutations invalidate
     * that key, and adding a game to your backlog does not change what is
     * similar to it.
     */
    similar: (id: number, limit: number) => ["games", "similar", id, limit] as const,
  },
  backlog: {
    all: ["backlog"] as const,
    list: (status: BacklogStatus | undefined, sort: BacklogSort) =>
      ["backlog", "list", status ?? "all", sort] as const,
    stats: () => ["backlog", "stats"] as const,
  },
} as const;
