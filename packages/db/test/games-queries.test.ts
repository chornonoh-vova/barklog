import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import {
  gameExists,
  getGameDetail,
  popularGames,
  recentGames,
  searchGames,
  similarGames,
  upcomingGames,
} from "../src/queries/games.js";
import * as schema from "../src/schema/index.js";
import { truncateAll } from "../src/testing.js";

const { db, close } = createDb(inject("databaseUrl"));

const UPDATED = new Date("2026-01-01T00:00:00Z");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface Fixture {
  id: number;
  name: string;
  count: number;
  /** Defaults to 0 = Main Game, which is searchable. */
  typeId?: number;
  rating?: number | null;
  /** Null keeps a fixture out of both release feeds. */
  releaseDate?: Date | null;
  cover?: string | null;
}

/**
 * The ranking cases from spec §9 and §15. `Zeldas Adventure` and the ROM hack
 * are the rows a naive ranking puts first: plain `similarity` prefers the short
 * title, and pure `word_similarity` ties the ROM hack with Odyssey.
 */
const RANKING_FIXTURES: Fixture[] = [
  { id: 1, name: "The Legend of Zelda: Breath of the Wild", count: 3000 },
  { id: 2, name: "The Legend of Zelda: Ocarina of Time", count: 2000 },
  { id: 3, name: "Zeldas Adventure", count: 3 },
  { id: 4, name: "Super Mario Odyssey", count: 2500 },
  { id: 5, name: "Mario Teaches Typing ROM Hack", count: 1 },
  { id: 6, name: "Dark Souls III", count: 4000 },
  { id: 7, name: "Dark Souls", count: 3500 },
  // Type 1 is DLC: not searchable, however popular it is.
  { id: 8, name: "Dark Souls: Artorias of the Abyss", count: 9000, typeId: 1 },
  { id: 9, name: "Obscure Unrated Platformer", count: 800, rating: 40 },
];

async function seed(fixtures: Fixture[]): Promise<void> {
  await db
    .insert(schema.gameTypes)
    .values([
      { id: 0, name: "Main Game" },
      { id: 1, name: "DLC" },
    ])
    .onConflictDoNothing();

  await db.insert(schema.games).values(
    fixtures.map((fixture) => ({
      id: fixture.id,
      name: fixture.name,
      slug: slugify(fixture.name),
      gameTypeId: fixture.typeId ?? 0,
      totalRating: fixture.rating === undefined ? 85 : fixture.rating,
      totalRatingCount: fixture.count,
      firstReleaseDate: fixture.releaseDate ?? null,
      coverImageId: fixture.cover === undefined ? `co${fixture.id}` : fixture.cover,
      igdbUpdatedAt: UPDATED,
    })),
  );
}

async function seedSimilar(gameId: number, similarIds: number[]): Promise<void> {
  await db
    .insert(schema.gameSimilar)
    .values(similarIds.map((similarGameId) => ({ gameId, similarGameId })));
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("a four-letter prefix finds the popular Zelda, not the obscure one", async () => {
  await seed(RANKING_FIXTURES);

  const results = await searchGames(db, { query: "zeld", limit: 10, offset: 0 });
  const names = results.map((row) => row.name);

  // word_similarity is what makes a long title match at all; the popularity
  // term is what decides which of the matches comes first.
  expect(names[0]).toBe("The Legend of Zelda: Breath of the Wild");
  expect(names).toContain("Zeldas Adventure");
  expect(names.indexOf("Zeldas Adventure")).toBeGreaterThan(1);
});

test("popularity keeps a ROM hack from beating Odyssey on an exact word match", async () => {
  await seed(RANKING_FIXTURES);

  const names = (await searchGames(db, { query: "mario", limit: 10, offset: 0 })).map(
    (row) => row.name,
  );

  expect(names[0]).toBe("Super Mario Odyssey");
  expect(names).toContain("Mario Teaches Typing ROM Hack");
});

test("a misspelled query still ranks the right series first", async () => {
  await seed(RANKING_FIXTURES);

  const names = (await searchGames(db, { query: "dark soules", limit: 10, offset: 0 })).map(
    (row) => row.name,
  );

  expect(names[0]).toBe("Dark Souls III");
  expect(names[1]).toBe("Dark Souls");
});

test("non-searchable game types are excluded however popular they are", async () => {
  await seed(RANKING_FIXTURES);

  const names = (await searchGames(db, { query: "dark souls", limit: 10, offset: 0 })).map(
    (row) => row.name,
  );

  expect(names).not.toContain("Dark Souls: Artorias of the Abyss");
});

test("pagination neither repeats nor skips a row", async () => {
  // Two identical names with identical popularity: only the id tie-break makes
  // the order total, and without it a page boundary could duplicate a row.
  await seed([
    { id: 20, name: "Same Name Game", count: 100 },
    { id: 21, name: "Same Name Game", count: 100 },
    { id: 22, name: "Same Name Game", count: 100 },
  ]);

  const [first] = await searchGames(db, { query: "same name", limit: 1, offset: 0 });
  const [second] = await searchGames(db, { query: "same name", limit: 1, offset: 1 });
  const [third] = await searchGames(db, { query: "same name", limit: 1, offset: 2 });

  expect([first?.id, second?.id, third?.id]).toEqual([20, 21, 22]);
});

test("a query below the similarity threshold matches nothing", async () => {
  await seed(RANKING_FIXTURES);

  expect(await searchGames(db, { query: "qqqqzzzz", limit: 10, offset: 0 })).toEqual([]);
});

test("popular ranks by rating count behind a rating floor and searchable types", async () => {
  await seed(RANKING_FIXTURES);

  const names = (await popularGames(db, { limit: 10 })).map((row) => row.name);

  expect(names[0]).toBe("Dark Souls III");
  // Below the rating floor, so popularity alone does not earn a place.
  expect(names).not.toContain("Obscure Unrated Platformer");
  // A DLC, so out of scope for the explore feed.
  expect(names).not.toContain("Dark Souls: Artorias of the Abyss");
});

test("popular excludes a well-rated game that has not been rated enough times", async () => {
  // Rating is high enough to clear POPULAR_RATING_FLOOR, but the count sits
  // right at POPULAR_RATING_COUNT_FLOOR (50, matching games_popular_idx's
  // partial predicate of `> 50`), which is not enough to qualify.
  await seed([
    ...RANKING_FIXTURES,
    { id: 10, name: "Hidden Gem With Few Ratings", count: 50, rating: 95 },
  ]);

  const names = (await popularGames(db, { limit: 10 })).map((row) => row.name);

  expect(names).not.toContain("Hidden Gem With Few Ratings");
});

/** A fixed clock, so the window boundaries below are arithmetic. */
const NOW = new Date("2026-06-15T12:00:00Z");
const at = (iso: string): Date => new Date(iso);

const RELEASE_FIXTURES: Fixture[] = [
  // Ahead of today, so upcoming — and deliberately not in date order here.
  { id: 30, name: "Ships Next Year", count: 0, releaseDate: at("2027-03-01T00:00:00Z") },
  { id: 31, name: "Ships Next Month", count: 0, releaseDate: at("2026-07-01T00:00:00Z") },
  // Midnight today: the boundary itself belongs to upcoming, not recent.
  { id: 32, name: "Ships Today", count: 0, releaseDate: at("2026-06-15T00:00:00Z") },
  // Inside the 90-day window, so recent. Counts decide their order.
  {
    id: 33,
    name: "Out Last Week, Talked About",
    count: 900,
    releaseDate: at("2026-06-08T00:00:00Z"),
  },
  { id: 34, name: "Out Last Week, Ignored", count: 4, releaseDate: at("2026-06-09T00:00:00Z") },
  // One second before today, so the far edge of recent.
  { id: 35, name: "Out Yesterday", count: 50, releaseDate: at("2026-06-14T23:59:59Z") },
  // Older than the window.
  { id: 36, name: "Out Last Year", count: 5000, releaseDate: at("2025-06-15T00:00:00Z") },
];

test("upcoming lists unreleased games soonest first", async () => {
  await seed(RELEASE_FIXTURES);

  const names = (await upcomingGames(db, { limit: 10, now: NOW })).map((row) => row.name);

  expect(names).toEqual(["Ships Today", "Ships Next Month", "Ships Next Year"]);
});

test("recent covers the ninety days before today, ranked by rating count", async () => {
  await seed(RELEASE_FIXTURES);

  const names = (await recentGames(db, { limit: 10, now: NOW })).map((row) => row.name);

  expect(names).toEqual(["Out Last Week, Talked About", "Out Yesterday", "Out Last Week, Ignored"]);
});

test("the two release feeds partition at today, sharing nothing", async () => {
  await seed(RELEASE_FIXTURES);

  const upcoming = await upcomingGames(db, { limit: 50, now: NOW });
  const recent = await recentGames(db, { limit: 50, now: NOW });
  const shared = upcoming.filter((game) => recent.some((other) => other.id === game.id));

  expect(shared).toEqual([]);
});

test("a game with no release date reaches neither feed", async () => {
  await seed([...RELEASE_FIXTURES, ...RANKING_FIXTURES]);

  const names = [
    ...(await upcomingGames(db, { limit: 50, now: NOW })),
    ...(await recentGames(db, { limit: 50, now: NOW })),
  ].map((row) => row.name);

  expect(names).not.toContain("Dark Souls III");
});

test("both release feeds skip non-searchable types and games with no cover art", async () => {
  await seed([
    ...RELEASE_FIXTURES,
    // Type 1 is DLC.
    { id: 40, name: "Upcoming DLC", count: 0, typeId: 1, releaseDate: at("2026-07-02T00:00:00Z") },
    {
      id: 41,
      name: "Released DLC",
      count: 800,
      typeId: 1,
      releaseDate: at("2026-06-10T00:00:00Z"),
    },
    {
      id: 42,
      name: "Upcoming Placeholder",
      count: 0,
      cover: null,
      releaseDate: at("2026-07-03T00:00:00Z"),
    },
    {
      id: 43,
      name: "Released Placeholder",
      count: 700,
      cover: null,
      releaseDate: at("2026-06-11T00:00:00Z"),
    },
  ]);

  const names = [
    ...(await upcomingGames(db, { limit: 50, now: NOW })),
    ...(await recentGames(db, { limit: 50, now: NOW })),
  ].map((row) => row.name);

  expect(names).not.toContain("Upcoming DLC");
  expect(names).not.toContain("Released DLC");
  expect(names).not.toContain("Upcoming Placeholder");
  expect(names).not.toContain("Released Placeholder");
});

test("game details gather every child collection and split the companies", async () => {
  await seed([{ id: 1942, name: "The Witcher 3: Wild Hunt", count: 4021 }]);

  await db.insert(schema.genres).values({ id: 12, name: "Role-playing (RPG)", slug: "rpg" });
  await db
    .insert(schema.platforms)
    .values({ id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC", slug: "win" });
  await db.insert(schema.companies).values([
    { id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" },
    { id: 42, name: "Bandai Namco", slug: "bandai-namco" },
  ]);
  await db.insert(schema.gameGenres).values({ gameId: 1942, genreId: 12 });
  await db.insert(schema.gamePlatforms).values({ gameId: 1942, platformId: 6 });
  await db.insert(schema.gameCompanies).values([
    { gameId: 1942, companyId: 908, isDeveloper: true, isPublisher: true },
    { gameId: 1942, companyId: 42, isDeveloper: false, isPublisher: true },
  ]);
  await db.insert(schema.gameScreenshots).values([
    { gameId: 1942, imageId: "sc6l7z" },
    { gameId: 1942, imageId: "sc6l80" },
  ]);

  const detail = await getGameDetail(db, 1942);

  expect(detail).not.toBeNull();
  expect(detail?.name).toBe("The Witcher 3: Wild Hunt");
  expect(detail?.gameType).toEqual({ id: 0, name: "Main Game" });
  expect(detail?.genres).toEqual([{ id: 12, name: "Role-playing (RPG)", slug: "rpg" }]);
  expect(detail?.platforms).toEqual([
    { id: 6, name: "PC (Microsoft Windows)", abbreviation: "PC", slug: "win" },
  ]);
  expect(detail?.screenshots).toEqual(["sc6l7z", "sc6l80"]);
  // A company flagged both ways appears in both lists.
  expect(detail?.developers.map((company) => company.id)).toEqual([908]);
  expect(detail?.publishers.map((company) => company.id)).toEqual([42, 908]);
  expect(detail?.parentGame).toBeNull();
});

test("a parent_game_id pointing at a game we have not mirrored resolves to null", async () => {
  // Spec §4: parent_game_id is a soft reference with no foreign key, because a
  // DLC can arrive in a sync page before its parent does.
  await seed([{ id: 30, name: "Some Expansion", count: 10 }]);
  await db.update(schema.games).set({ parentGameId: 999_999 }).where(eq(schema.games.id, 30));

  const detail = await getGameDetail(db, 30);

  expect(detail?.parentGame).toBeNull();
});

test("details for an unmirrored id are null, and gameExists agrees", async () => {
  await seed([{ id: 40, name: "Hades", count: 500 }]);

  expect(await getGameDetail(db, 999_999)).toBeNull();
  expect(await gameExists(db, 40)).toBe(true);
  expect(await gameExists(db, 999_999)).toBe(false);
});

test("similar games come back most-rated first", async () => {
  await seed(RANKING_FIXTURES);
  await seedSimilar(1, [2, 4, 6]);

  const rows = await similarGames(db, { gameId: 1, limit: 12 });

  // 6 = Dark Souls III (4000), 4 = Odyssey (2500), 2 = Ocarina (2000).
  expect(rows.map((row) => row.id)).toEqual([6, 4, 2]);
});

test("a similar id missing from the mirror is dropped", async () => {
  await seed(RANKING_FIXTURES);
  await seedSimilar(1, [2, 999_999]);

  const rows = await similarGames(db, { gameId: 1, limit: 12 });

  expect(rows.map((row) => row.id)).toEqual([2]);
});

test("DLC is filtered out of similar games however popular it is", async () => {
  await seed(RANKING_FIXTURES);
  // 8 is type 1 (DLC) with a rating count of 9000 — it would sort first.
  await seedSimilar(6, [7, 8]);

  const rows = await similarGames(db, { gameId: 6, limit: 12 });

  expect(rows.map((row) => row.id)).toEqual([7]);
});

test("the similar games relation is directional", async () => {
  await seed(RANKING_FIXTURES);
  await seedSimilar(1, [2]);

  expect(await similarGames(db, { gameId: 2, limit: 12 })).toEqual([]);
});

test("the similar games limit is respected", async () => {
  await seed(RANKING_FIXTURES);
  await seedSimilar(1, [2, 4, 6, 7]);

  const rows = await similarGames(db, { gameId: 1, limit: 2 });

  expect(rows.map((row) => row.id)).toEqual([6, 7]);
});

test("a game with no suggestions returns an empty list, not an error", async () => {
  await seed(RANKING_FIXTURES);

  expect(await similarGames(db, { gameId: 1, limit: 12 })).toEqual([]);
});

test("similar games carry the same projection as every other list", async () => {
  await seed(RANKING_FIXTURES);
  await seedSimilar(1, [2]);

  const [row] = await similarGames(db, { gameId: 1, limit: 12 });

  expect(Object.keys(row!).sort()).toEqual([
    "coverImageId",
    "firstReleaseDate",
    "id",
    "name",
    "slug",
    "totalRating",
    "totalRatingCount",
  ]);
});
