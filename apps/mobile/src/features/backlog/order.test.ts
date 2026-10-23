import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { compare } from "@/features/backlog/order";

const entry = (gameId: number, status: BacklogStatus, rating: number | null = null) =>
  ({
    gameId,
    status,
    rating,
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    game: {
      id: gameId,
      name: `Game ${gameId}`,
      slug: `game-${gameId}`,
      coverImageId: null,
      firstReleaseDate: null,
      totalRating: null,
      totalRatingCount: 0,
    },
  }) satisfies BacklogListItemWire;

describe("compare", () => {
  it("sorts by rating with unrated last, like the server's NULLS LAST", () => {
    const items = [entry(3, "playing"), entry(1, "playing", 5), entry(2, "playing", 9)];

    expect(items.sort((a, b) => compare("rating", a, b)).map((i) => i.gameId)).toEqual([2, 1, 3]);
  });
});
