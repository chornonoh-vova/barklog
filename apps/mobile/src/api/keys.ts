import type { BacklogSort, BacklogStatus, GameFeed } from "@repo/contracts";

/** `stats` sits under `backlog` so one invalidation sweeps list and counts. */
export const keys = {
  games: {
    search: (q: string, limit: number, offset: number) =>
      ["games", "search", q, limit, offset] as const,
    feed: (feed: GameFeed, limit: number) => ["games", "feed", feed, limit] as const,
    detail: (id: number) => ["games", "detail", id] as const,
    // Not under `detail`: the backlog mutations invalidate that key, and an add
    // does not change what is similar to a game.
    similar: (id: number, limit: number) => ["games", "similar", id, limit] as const,
    // Keyed by the shared url, not the video id: the app does not parse the
    // url, and the server's answer is per-url anyway.
    identify: (url: string) => ["games", "identify", url] as const,
  },
  backlog: {
    all: ["backlog"] as const,
    list: (status: BacklogStatus | undefined, sort: BacklogSort) =>
      ["backlog", "list", status ?? "all", sort] as const,
    stats: () => ["backlog", "stats"] as const,
  },
} as const;
