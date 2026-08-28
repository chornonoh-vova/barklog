import type { BacklogSort, BacklogStatus } from "@repo/contracts";

import type { GameFeed } from "./endpoints";

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
  },
  backlog: {
    all: ["backlog"] as const,
    list: (status: BacklogStatus | undefined, sort: BacklogSort) =>
      ["backlog", "list", status ?? "all", sort] as const,
    stats: () => ["backlog", "stats"] as const,
  },
} as const;
