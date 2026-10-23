import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { compare, patchBacklogList } from "@/features/backlog/optimistic-list";

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

const NOW = "2026-10-13T12:00:00.000Z";

describe("patchBacklogList", () => {
  const list = { items: [entry(1, "playing", 9), entry(2, "waiting")] };

  it("drops a removed game", () => {
    expect(patchBacklogList(list, 1, null, NOW).items.map((i) => i.gameId)).toEqual([2]);
  });

  it("moves an edited game to the front of a list sorted by last update", () => {
    const next = patchBacklogList(list, 2, { status: "playing", rating: null }, NOW);

    expect(next.items.map((i) => i.gameId)).toEqual([2, 1]);
  });

  it("moves a game to its new status and keeps the rating it was given", () => {
    const next = patchBacklogList(list, 1, { status: "completed", rating: 9 }, NOW);

    expect(next.items[0]).toMatchObject({
      gameId: 1,
      status: "completed",
      rating: 9,
      updatedAt: NOW,
    });
    expect(next.items[1]).toBe(list.items[1]);
  });

  it("leaves a list without the game untouched", () => {
    expect(patchBacklogList(list, 99, null, NOW)).toBe(list);
  });

  it("does not mutate its input", () => {
    patchBacklogList(list, 1, { status: "abandoned", rating: null }, NOW);

    expect(list.items[0]?.status).toBe("playing");
  });
});

describe("compare", () => {
  it("sorts by rating with unrated last, like the server's NULLS LAST", () => {
    const items = [entry(3, "playing"), entry(1, "playing", 5), entry(2, "playing", 9)];

    expect(items.sort((a, b) => compare("rating", a, b)).map((i) => i.gameId)).toEqual([2, 1, 3]);
  });
});
