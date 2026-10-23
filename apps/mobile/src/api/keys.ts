import type { GameFeed } from "@repo/contracts";

export const keys = {
  /** Entitlement only — slot counts are derived from `backlog.list`. */
  me: () => ["me"] as const,
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
    /** One invalidation sweeps everything under `backlog`. */
    all: ["backlog"] as const,
    /** The whole backlog; Home's filters are derived from it (see `useBacklog`). */
    list: () => ["backlog", "list"] as const,
  },
} as const;
