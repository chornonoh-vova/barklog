import type { BacklogSort, BacklogStatus } from "@repo/contracts";

/**
 * Every cache key in one place, so none is spelled twice.
 *
 * `stats` sits under the `backlog` namespace deliberately: a mutation
 * invalidates `keys.backlog.all` and that must sweep the list *and* the counts,
 * which only works because they share a first element.
 *
 * The list key uses the literal `"all"` rather than `undefined` for the
 * unfiltered case — an `undefined` inside a key array is legal but reads as an
 * accident, and it makes the two cases indistinguishable in devtools.
 */
export const keys = {
  games: {
    all: ["games"] as const,
    search: (q: string, limit: number, offset: number) =>
      ["games", "search", q, limit, offset] as const,
    popular: (limit: number) => ["games", "popular", limit] as const,
    detail: (id: number) => ["games", "detail", id] as const,
  },
  backlog: {
    all: ["backlog"] as const,
    list: (status: BacklogStatus | undefined, sort: BacklogSort) =>
      ["backlog", "list", status ?? "all", sort] as const,
    stats: () => ["backlog", "stats"] as const,
  },
} as const;
