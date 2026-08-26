import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { gameExists, getGameDetail, popularGames, searchGames } from "../src/queries/games.js";
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
      igdbUpdatedAt: UPDATED,
    })),
  );
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
