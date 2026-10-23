import { BACKLOG_STATUSES, type BacklogListItemWire, type BacklogStatus } from "@repo/contracts";

import { statusSymbol } from "@/features/game/format";
import {
  deriveSnapshot,
  shelfCoverIds,
  signedOutSnapshot,
  WIDGET_SHELF_SIZE,
} from "@/features/widgets/snapshot";

const MASCOT = "file:///group/ExpoWidgets/mascot.png";

const item = (
  gameId: number,
  status: BacklogStatus,
  updatedAt: string,
  opts: { rating?: number | null; coverImageId?: string | null; name?: string } = {},
): BacklogListItemWire => ({
  gameId,
  status,
  rating: opts.rating ?? null,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
  game: {
    id: gameId,
    name: opts.name ?? `Game ${gameId}`,
    slug: `game-${gameId}`,
    coverImageId: opts.coverImageId ?? null,
    firstReleaseDate: null,
    totalRating: null,
    totalRatingCount: 0,
  },
});

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T12:00:00.000Z`;

/** Every leaf, so a `null` buried anywhere is caught. */
function leaves(value: unknown): unknown[] {
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(leaves);

  return [value];
}

describe("deriveSnapshot", () => {
  it("groups by status and keeps the 4 most recently updated per section", () => {
    const items = [
      item(1, "playing", day(1)),
      item(2, "playing", day(5)),
      item(3, "playing", day(3)),
      item(4, "playing", day(4)),
      item(5, "playing", day(2)),
      item(6, "waiting", day(9)),
    ];

    const { sections } = deriveSnapshot(items, {}, MASCOT);

    expect(WIDGET_SHELF_SIZE).toBe(4);
    expect(sections.playing.games.map((g) => g.id)).toEqual([2, 4, 3, 5]);
    expect(sections.playing.count).toBe(5);
    expect(sections.waiting.games.map((g) => g.id)).toEqual([6]);
  });

  it("gives every status a section, empty ones with no games and the empty copy", () => {
    const { sections } = deriveSnapshot([item(1, "playing", day(1))], {}, MASCOT);

    expect(Object.keys(sections).sort()).toEqual([...BACKLOG_STATUSES].sort());
    expect(sections.abandoned).toMatchObject({ count: 0, games: [], empty: "Nothing abandoned" });
  });

  it("titles each section with its uppercase status label", () => {
    const { sections } = deriveSnapshot([], {}, MASCOT);

    expect(sections.waiting.title).toBe("WAITING");
    expect(sections.playing.title).toBe("PLAYING");
  });

  it("gives each section the app's symbol for its status", () => {
    const { sections } = deriveSnapshot([], {}, MASCOT);

    for (const status of BACKLOG_STATUSES) {
      expect(sections[status].symbol).toBe(statusSymbol(status));
    }
  });

  it("uses the cached cover file, or an empty string when there is none", () => {
    const items = [
      item(1, "playing", day(3), { coverImageId: "abc" }),
      item(2, "playing", day(2), { coverImageId: null }),
      item(3, "playing", day(1), { coverImageId: "missing" }),
    ];

    const { sections } = deriveSnapshot(items, { abc: "file:///g/covers/abc.jpg" }, MASCOT);

    expect(sections.playing.games.map((g) => g.cover)).toEqual([
      "file:///g/covers/abc.jpg",
      "",
      "",
    ]);
  });

  it("passes the rating through, and an unrated game gets 0", () => {
    const items = [item(1, "playing", day(2), { rating: 8 }), item(2, "playing", day(1))];

    const { sections } = deriveSnapshot(items, {}, MASCOT);

    expect(sections.playing.games.map((g) => g.rating)).toEqual([8, 0]);
  });

  it("deep-links each game and each section", () => {
    const { sections, appUrl } = deriveSnapshot([item(42, "playing", day(1))], {}, MASCOT);

    expect(sections.playing.games[0]?.url).toBe("barklog://widget/game/42");
    expect(sections.playing.url).toBe("barklog://widget/home/playing");
    expect(appUrl).toBe("barklog://widget/home");
  });

  it("is signed in and carries the mascot", () => {
    const snapshot = deriveSnapshot([], {}, MASCOT);

    expect(snapshot.signedIn).toBe(true);
    expect(snapshot.mascot).toBe(MASCOT);
  });

  // The native side stores props in UserDefaults, which throws on NSNull.
  it("contains no null or undefined anywhere", () => {
    const items = [item(1, "playing", day(1)), item(2, "waiting", day(2), { rating: 5 })];

    expect(leaves(deriveSnapshot(items, {}, "")).filter((v) => v == null)).toEqual([]);
    expect(leaves(signedOutSnapshot("")).filter((v) => v == null)).toEqual([]);
  });
});

describe("signedOutSnapshot", () => {
  it("is signed out, with the open-the-app message and no games", () => {
    const snapshot = signedOutSnapshot(MASCOT);

    expect(snapshot.signedIn).toBe(false);
    expect(snapshot.message).toBe("Open Barklog to see your backlog.");
    expect(snapshot.mascot).toBe(MASCOT);
    for (const status of BACKLOG_STATUSES) {
      expect(snapshot.sections[status]).toMatchObject({ count: 0, games: [] });
    }
  });
});

describe("shelfCoverIds", () => {
  it("returns only the kept games' cover ids, without nulls or duplicates", () => {
    const items = [
      item(1, "playing", day(5), { coverImageId: "a" }),
      item(2, "playing", day(4), { coverImageId: null }),
      item(3, "playing", day(3), { coverImageId: "a" }),
      item(6, "playing", day(2), { coverImageId: "kept" }),
      item(4, "playing", day(1), { coverImageId: "dropped" }),
      item(5, "waiting", day(1), { coverImageId: "w" }),
    ];

    expect(shelfCoverIds(items).sort()).toEqual(["a", "kept", "w"]);
  });
});
