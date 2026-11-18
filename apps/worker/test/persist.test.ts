import { createDb, schema } from "@repo/db";
import { truncateAll } from "@repo/db/testing";
import { mapGames } from "@repo/igdb";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { persistPage } from "../src/persist.js";

const { db, close } = createDb(inject("databaseUrl"));

const PAGE = [
  {
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    updated_at: 1755000000,
    total_rating_count: 4021,
    game_type: { id: 0, type: "Main Game" },
    cover: { id: 1, image_id: "co1wyy" },
    screenshots: [{ id: 10, image_id: "sc6l7z" }],
    similar_games: [1943, 472],
    genres: [{ id: 12, name: "Role-playing (RPG)", slug: "role-playing-rpg" }],
    platforms: [{ id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC", slug: "win" }],
    involved_companies: [
      {
        id: 1,
        company: { id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" },
        developer: true,
      },
      {
        id: 2,
        company: { id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" },
        publisher: true,
      },
    ],
  },
  {
    id: 1943,
    name: "Cyberpunk 2077",
    slug: "cyberpunk-2077",
    updated_at: 1755000500,
    total_rating_count: 3000,
    game_type: { id: 0, type: "Main Game" },
    genres: [{ id: 12, name: "Role-playing (RPG)", slug: "role-playing-rpg" }],
    platforms: [{ id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC", slug: "win" }],
    similar_games: [1942],
  },
];

/** `synced_at` is excluded: it is bookkeeping, and moves on every replay. */
async function snapshot() {
  const games = await db.select().from(schema.games).orderBy(schema.games.id);
  return {
    games: games.map(({ syncedAt: _syncedAt, ...game }) => game),
    genres: await db.select().from(schema.genres),
    platforms: await db.select().from(schema.platforms),
    companies: await db.select().from(schema.companies),
    gameGenres: await db.select().from(schema.gameGenres),
    gameCompanies: await db.select().from(schema.gameCompanies),
    screenshots: await db.select().from(schema.gameScreenshots),
    gameSimilar: await db.select().from(schema.gameSimilar),
  };
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("replaying the same page leaves the database identical", async () => {
  await persistPage(db, mapGames(PAGE));
  const first = await snapshot();

  await persistPage(db, mapGames(PAGE));
  const second = await snapshot();

  expect(second).toEqual(first);
});

test("replaying advances synced_at, so a re-run is visible in the mirror", async () => {
  await persistPage(db, mapGames(PAGE));
  const [before] = await db.select().from(schema.games).orderBy(schema.games.id);

  await persistPage(db, mapGames(PAGE));
  const [after] = await db.select().from(schema.games).orderBy(schema.games.id);

  expect(after!.syncedAt.getTime()).toBeGreaterThanOrEqual(before!.syncedAt.getTime());
});

test("a page with two games sharing a genre inserts the genre once", async () => {
  await persistPage(db, mapGames(PAGE));

  expect(await db.select().from(schema.genres)).toHaveLength(1);
  expect(await db.select().from(schema.gameGenres)).toHaveLength(2);
});

test("a company that develops and publishes becomes one row", async () => {
  await persistPage(db, mapGames(PAGE));

  const rows = await db.select().from(schema.gameCompanies);
  expect(rows).toEqual([{ gameId: 1942, companyId: 908, isDeveloper: true, isPublisher: true }]);
});

test("an updated game overwrites its previous values", async () => {
  await persistPage(db, mapGames(PAGE));

  await persistPage(
    db,
    mapGames([{ ...PAGE[0]!, name: "The Witcher 3: Wild Hunt GOTY", total_rating_count: 5000 }]),
  );

  const [game] = await db.select().from(schema.games).orderBy(schema.games.id);
  expect(game!.name).toBe("The Witcher 3: Wild Hunt GOTY");
  expect(game!.totalRatingCount).toBe(5000);
});

test("removed child rows disappear on re-sync", async () => {
  await persistPage(db, mapGames(PAGE));
  await persistPage(db, mapGames([{ ...PAGE[0]!, genres: [], screenshots: [] }]));

  const remaining = await db.select().from(schema.gameGenres);
  expect(remaining.map((row) => row.gameId)).toEqual([1943]);
  expect(await db.select().from(schema.gameScreenshots)).toHaveLength(0);
});

test("an empty page is a no-op", async () => {
  await expect(persistPage(db, mapGames([]))).resolves.toBeUndefined();
  expect(await db.select().from(schema.games)).toHaveLength(0);
});

test("a failure inside the page rolls the whole page back", async () => {
  const page = mapGames(PAGE);
  page.gameGenres.push({ gameId: 999999, genreId: 12 }); // violates the games FK

  await expect(persistPage(db, page)).rejects.toThrow();
  expect(await db.select().from(schema.games)).toHaveLength(0);
});

test("similar game rows are written for the page", async () => {
  await persistPage(db, mapGames(PAGE));

  const rows = await db
    .select()
    .from(schema.gameSimilar)
    .orderBy(schema.gameSimilar.gameId, schema.gameSimilar.similarGameId);

  expect(rows).toEqual([
    { gameId: 1942, similarGameId: 472 },
    { gameId: 1942, similarGameId: 1943 },
    { gameId: 1943, similarGameId: 1942 },
  ]);
});

test("a similar id pointing outside the mirror is still stored", async () => {
  await persistPage(db, mapGames(PAGE));

  const rows = await db
    .select()
    .from(schema.gameSimilar)
    .where(eq(schema.gameSimilar.similarGameId, 472));

  expect(rows).toHaveLength(1);
});

test("a similar game IGDB dropped disappears on re-sync", async () => {
  await persistPage(db, mapGames(PAGE));
  await persistPage(db, mapGames([{ ...PAGE[0]!, similar_games: [] }]));

  const rows = await db.select().from(schema.gameSimilar);

  expect(rows).toEqual([{ gameId: 1943, similarGameId: 1942 }]);
});

test("re-syncing a game that gained the erotic theme purges its stored screenshots", async () => {
  await persistPage(db, mapGames(PAGE));
  expect(await db.select().from(schema.gameScreenshots)).toHaveLength(1);

  // IGDB still lists the screenshots; the theme is what suppresses them.
  await persistPage(db, mapGames([{ ...PAGE[0]!, themes: [42] }]));

  expect(await db.select().from(schema.gameScreenshots)).toHaveLength(0);
  expect(await db.select().from(schema.games)).toHaveLength(2);
});

const RELEASE_2027 = Date.UTC(2027, 11, 31) / 1000;
const UPCOMING = {
  id: 2000,
  name: "Upcoming",
  slug: "upcoming",
  updated_at: 1755000000,
  first_release_date: RELEASE_2027,
  release_dates: [{ id: 1, date: RELEASE_2027, date_format: { id: 2, format: "YYYY" } }],
};

async function precisionOf(id: number) {
  const [row] = await db
    .select({ precision: schema.games.releaseDatePrecision })
    .from(schema.games)
    .where(eq(schema.games.id, id));
  return row!.precision;
}

test("the release date precision is stored with the game", async () => {
  await persistPage(db, mapGames([UPCOMING, PAGE[0]!]));

  expect(await precisionOf(2000)).toBe("year");
  // PAGE[0] has no first_release_date at all.
  expect(await precisionOf(1942)).toBe("none");
});

test("a date that firms up overwrites the stored precision", async () => {
  await persistPage(db, mapGames([UPCOMING]));

  const day = Date.UTC(2027, 5, 5) / 1000;
  await persistPage(
    db,
    mapGames([
      {
        ...UPCOMING,
        first_release_date: day,
        release_dates: [{ id: 1, date: day, date_format: { id: 0, format: "YYYYMMDD" } }],
      },
    ]),
  );

  expect(await precisionOf(2000)).toBe("day");
});

test("a date that loses its matching entry goes back to unclassified, not a stale guess", async () => {
  await persistPage(db, mapGames([UPCOMING]));
  await persistPage(db, mapGames([{ ...UPCOMING, release_dates: [] }]));

  expect(await precisionOf(2000)).toBeNull();
});

test("re-syncing a game with backlog entries leaves those entries untouched", async () => {
  await persistPage(db, mapGames([UPCOMING]));
  await db.insert(schema.users).values([{ id: "user_a" }, { id: "user_b" }]);
  await db.insert(schema.backlogEntries).values([
    { userId: "user_a", gameId: 2000, status: "waiting" },
    { userId: "user_b", gameId: 2000, status: "playing", rating: 8 },
  ]);
  const before = await db
    .select()
    .from(schema.backlogEntries)
    .orderBy(schema.backlogEntries.userId);

  const day = Date.UTC(2027, 5, 5) / 1000;
  await persistPage(
    db,
    mapGames([
      {
        ...UPCOMING,
        name: "Upcoming: Renamed",
        first_release_date: day,
        release_dates: [{ id: 1, date: day, date_format: { id: 0, format: "YYYYMMDD" } }],
      },
    ]),
  );

  expect(await precisionOf(2000)).toBe("day");
  const after = await db.select().from(schema.backlogEntries).orderBy(schema.backlogEntries.userId);
  expect(after).toEqual(before);
  expect(after).toHaveLength(2);
});
