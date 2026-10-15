import type { GameFeed, GameListResponse, GameSummaryWire } from "@repo/contracts";

import { i18n } from "@/i18n/instance";

const ROWS = 2;

/** In shelf order. Each feed's title is its key under `explore`. */
export const SHELVES = ["popular", "upcoming", "recent"] as const satisfies readonly GameFeed[];

export interface Shelf {
  feed: GameFeed;
  title: string;
  columns: GameSummaryWire[][];
}

/** A horizontal `FlatList` has no `numColumns`, so one list item is one column. */
export function toColumns(items: GameSummaryWire[]): GameSummaryWire[][] {
  const columns: GameSummaryWire[][] = [];

  for (let index = 0; index < items.length; index += ROWS) {
    columns.push(items.slice(index, index + ROWS));
  }

  return columns;
}

export function toShelves(data: Partial<Record<GameFeed, GameListResponse>>): Shelf[] {
  return SHELVES.flatMap((feed) => {
    const items = data[feed]?.items ?? [];

    return items.length === 0
      ? []
      : [{ feed, title: i18n.t(`explore.${feed}`), columns: toColumns(items) }];
  });
}
