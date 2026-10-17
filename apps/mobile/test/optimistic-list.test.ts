import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { patchBacklogList, patchBacklogStats } from "@/features/backlog/optimistic-list";

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
    expect(
      patchBacklogList(list, "all", "updated_at", 1, null, NOW).items.map((i) => i.gameId),
    ).toEqual([2]);
  });

  it("moves an edited game to the front of a list sorted by last update", () => {
    const next = patchBacklogList(
      list,
      "all",
      "updated_at",
      2,
      { status: "playing", rating: null },
      NOW,
    );

    expect(next.items.map((i) => i.gameId)).toEqual([2, 1]);
  });

  it("re-places a re-rated game in a list sorted by rating, unrated last", () => {
    const rated = { items: [entry(1, "playing", 9), entry(2, "playing", 5), entry(3, "playing")] };

    const up = patchBacklogList(rated, "all", "rating", 2, { status: "playing", rating: 10 }, NOW);
    expect(up.items.map((i) => i.gameId)).toEqual([2, 1, 3]);

    const cleared = patchBacklogList(
      rated,
      "all",
      "rating",
      1,
      { status: "playing", rating: null },
      NOW,
    );
    expect(cleared.items.map((i) => i.gameId)).toEqual([2, 1, 3]);
  });

  it("moves a game to its new status and keeps the rating it was given", () => {
    const next = patchBacklogList(
      list,
      "all",
      "updated_at",
      1,
      { status: "completed", rating: 9 },
      NOW,
    );

    expect(next.items[0]).toMatchObject({
      gameId: 1,
      status: "completed",
      rating: 9,
      updatedAt: NOW,
    });
    expect(next.items[1]).toBe(list.items[1]);
  });

  it("drops a game from a filtered list it no longer belongs to", () => {
    const playing = { items: [entry(1, "playing")] };

    expect(
      patchBacklogList(
        playing,
        "playing",
        "updated_at",
        1,
        { status: "completed", rating: null },
        NOW,
      ).items,
    ).toEqual([]);
  });

  it("keeps a game in a filtered list it still belongs to", () => {
    const playing = { items: [entry(1, "playing")] };

    expect(
      patchBacklogList(playing, "playing", "updated_at", 1, { status: "playing", rating: 7 }, NOW)
        .items[0],
    ).toMatchObject({ rating: 7 });
  });

  it("leaves a list without the game untouched", () => {
    expect(patchBacklogList(list, "all", "updated_at", 99, null, NOW)).toBe(list);
  });

  it("does not mutate its input", () => {
    patchBacklogList(list, "all", "updated_at", 1, { status: "abandoned", rating: null }, NOW);

    expect(list.items[0]?.status).toBe("playing");
  });
});

describe("patchBacklogStats", () => {
  const stats = {
    total: 3,
    counts: { waiting: 1, playing: 2, completed: 0, abandoned: 0 },
    averageRating: 8,
  };

  it("moves a count between statuses", () => {
    expect(patchBacklogStats(stats, "playing", "completed")).toEqual({
      ...stats,
      counts: { waiting: 1, playing: 1, completed: 1, abandoned: 0 },
    });
  });

  it("counts an add and a removal in the total", () => {
    expect(patchBacklogStats(stats, null, "waiting")).toMatchObject({
      total: 4,
      counts: { waiting: 2 },
    });
    expect(patchBacklogStats(stats, "playing", null)).toMatchObject({
      total: 2,
      counts: { playing: 1 },
    });
  });

  it("returns the stats as is when the status does not change", () => {
    expect(patchBacklogStats(stats, "playing", "playing")).toBe(stats);
  });
});
