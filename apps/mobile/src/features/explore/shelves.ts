import type { GameFeed, GameListResponse, GameSummaryWire } from "@repo/contracts";

const ROWS = 2;

export const SHELVES = [
  { feed: "popular", title: "Most Popular" },
  { feed: "upcoming", title: "Upcoming" },
  { feed: "recent", title: "Recently Released" },
] as const satisfies readonly { feed: GameFeed; title: string }[];

export interface Shelf {
  feed: GameFeed;
  title: string;
  /** Each column is the pair of tiles stacked at one horizontal position. */
  columns: GameSummaryWire[][];
}

/**
 * A horizontal `FlatList` has no `numColumns`, so the rows come from the data:
 * one list item is one column of two. An odd tail keeps its half-empty column.
 */
export function toColumns(items: GameSummaryWire[]): GameSummaryWire[][] {
  const columns: GameSummaryWire[][] = [];

  for (let index = 0; index < items.length; index += ROWS) {
    columns.push(items.slice(index, index + ROWS));
  }

  return columns;
}

/**
 * In flight and empty are treated alike — no shelf — so one slow or failed feed
 * leaves the other two readable.
 */
export function toShelves(data: Partial<Record<GameFeed, GameListResponse>>): Shelf[] {
  return SHELVES.flatMap(({ feed, title }) => {
    const items = data[feed]?.items ?? [];

    return items.length === 0 ? [] : [{ feed, title, columns: toColumns(items) }];
  });
}
