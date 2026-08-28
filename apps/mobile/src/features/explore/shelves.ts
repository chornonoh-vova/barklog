import type { GameListResponse, GameSummaryWire } from "@repo/contracts";

import type { GameFeed } from "@/api/endpoints";

/**
 * Ten columns of two — more than anyone swipes through, and three requests now
 * go out where one used to.
 */
export const SHELF_LIMIT = 20;

/** Two rows, scrolling sideways. */
const ROWS = 2;

/** The explore page, in the order it reads. */
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
 * A horizontal `FlatList` has no `numColumns` — that prop only splits a vertical
 * list — so the two rows come from the data instead: one list item is one
 * column of two games. An odd tail keeps its half-empty column rather than
 * being dropped.
 */
export function toColumns(items: GameSummaryWire[]): GameSummaryWire[][] {
  const columns: GameSummaryWire[][] = [];

  for (let index = 0; index < items.length; index += ROWS) {
    columns.push(items.slice(index, index + ROWS));
  }

  return columns;
}

/**
 * Three independent requests, one ordered page. A feed still in flight and a
 * feed that answered with nothing are treated alike: no shelf is drawn, and it
 * appears in place when it lands. That is what lets one slow or failed feed
 * leave the other two readable instead of taking the screen down with it.
 */
export function toShelves(data: Partial<Record<GameFeed, GameListResponse | undefined>>): Shelf[] {
  return SHELVES.flatMap(({ feed, title }) => {
    const items = data[feed]?.items ?? [];

    return items.length === 0 ? [] : [{ feed, title, columns: toColumns(items) }];
  });
}
