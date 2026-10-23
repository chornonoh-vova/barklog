import type { GameSummaryWire } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { toColumns, toShelves } from "@/features/explore/shelves";

const game = (id: number): GameSummaryWire => ({
  id,
  name: `Game ${id}`,
  slug: `game-${id}`,
  coverImageId: null,
  firstReleaseDate: null,
  totalRating: null,
  totalRatingCount: 0,
});

const feed = (...ids: number[]) => ({ items: ids.map(game) });

describe("toColumns", () => {
  it("stacks the items two to a column, in the order the API returned them", () => {
    expect(toColumns([game(1), game(2), game(3), game(4)]).map((c) => c.map((g) => g.id))).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("leaves an odd tail in a column of its own rather than dropping it", () => {
    expect(toColumns([game(1), game(2), game(3)]).map((c) => c.map((g) => g.id))).toEqual([
      [1, 2],
      [3],
    ]);
  });

  it("makes no columns from no items", () => {
    expect(toColumns([])).toEqual([]);
  });
});

describe("toShelves", () => {
  it("keeps the declared order however the three requests happen to land", () => {
    const shelves = toShelves({ recent: feed(3), popular: feed(1), upcoming: feed(2) });

    expect(shelves.map((shelf) => shelf.feed)).toEqual(["popular", "upcoming", "recent"]);
  });

  it("omits a feed that has not loaded, so a slow request draws no empty shelf", () => {
    const shelves = toShelves({ popular: feed(1), upcoming: undefined, recent: undefined });

    expect(shelves.map((shelf) => shelf.feed)).toEqual(["popular"]);
  });

  it("omits a feed that loaded with nothing in it", () => {
    const shelves = toShelves({ popular: feed(1), upcoming: feed(), recent: feed(2) });

    expect(shelves.map((shelf) => shelf.feed)).toEqual(["popular", "recent"]);
  });

  it("hands each shelf its items already in columns", () => {
    const [shelf] = toShelves({ popular: feed(1, 2) });

    expect(shelf?.columns.map((c) => c.map((g) => g.id))).toEqual([[1, 2]]);
  });
});
