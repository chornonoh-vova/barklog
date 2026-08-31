import { expect, test } from "vitest";

import { mapGames } from "../src/map.js";

const FULL_GAME = {
  id: 1942,
  name: "The Witcher 3: Wild Hunt",
  slug: "the-witcher-3-wild-hunt",
  summary: "A story-driven open world RPG.",
  first_release_date: 1431993600,
  updated_at: 1755000000,
  total_rating: 93.5,
  total_rating_count: 4021,
  game_type: { id: 0, type: "Main Game" },
  cover: { id: 1, image_id: "co1wyy" },
  screenshots: [{ id: 10, image_id: "sc6l7z" }],
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
};

test("maps a fully populated game", () => {
  const page = mapGames([FULL_GAME]);

  expect(page.games[0]).toEqual({
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    summary: "A story-driven open world RPG.",
    firstReleaseDate: new Date("2015-05-19T00:00:00.000Z"),
    gameTypeId: 0,
    parentGameId: null,
    totalRating: 93.5,
    totalRatingCount: 4021,
    coverImageId: "co1wyy",
    igdbUpdatedAt: new Date(1755000000 * 1000),
  });
  expect(page.screenshots).toEqual([{ gameId: 1942, imageId: "sc6l7z" }]);
  expect(page.gameGenres).toEqual([{ gameId: 1942, genreId: 12 }]);
  expect(page.gamePlatforms).toEqual([{ gameId: 1942, platformId: 6 }]);
});

test("IGDB omits absent optional fields entirely", () => {
  // IGDB does not send nulls — it leaves the key out. Every optional field must
  // survive being missing.
  const page = mapGames([{ id: 7, name: "Minimal", slug: "minimal", updated_at: 1700000000 }]);

  expect(page.games[0]).toEqual({
    id: 7,
    name: "Minimal",
    slug: "minimal",
    summary: null,
    firstReleaseDate: null,
    gameTypeId: null,
    parentGameId: null,
    totalRating: null,
    totalRatingCount: 0,
    coverImageId: null,
    igdbUpdatedAt: new Date(1700000000 * 1000),
  });
  expect(page.genres).toEqual([]);
  expect(page.gameCompanies).toEqual([]);
});

test("a company that both develops and publishes becomes one row with both flags", () => {
  // Two involved_companies entries collide on the (game_id, company_id) PK.
  const page = mapGames([FULL_GAME]);

  expect(page.gameCompanies).toEqual([
    { gameId: 1942, companyId: 908, isDeveloper: true, isPublisher: true },
  ]);
  expect(page.companies).toEqual([{ id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" }]);
});

test("a genre shared by two games is emitted once", () => {
  // Otherwise: "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const page = mapGames([
    FULL_GAME,
    { ...FULL_GAME, id: 1943, slug: "blood-and-wine", involved_companies: [] },
  ]);

  expect(page.genres).toHaveLength(1);
  expect(page.platforms).toHaveLength(1);
  expect(page.gameTypes).toHaveLength(1);
  expect(page.gameGenres).toHaveLength(2);
});

test("platform abbreviation is optional", () => {
  const page = mapGames([
    {
      ...FULL_GAME,
      platforms: [{ id: 99, name: "Odd Platform", slug: "odd" }],
    },
  ]);

  expect(page.platforms[0]).toEqual({
    id: 99,
    name: "Odd Platform",
    abbreviation: null,
    slug: "odd",
  });
});

test("a malformed record is rejected loudly rather than silently dropped", () => {
  expect(() => mapGames([{ id: "not-a-number", name: "Bad" }])).toThrow();
});

test("maps similar game ids into join rows", () => {
  const page = mapGames([{ ...FULL_GAME, similar_games: [1943, 472, 11156] }]);

  expect(page.gameSimilar).toEqual([
    { gameId: 1942, similarGameId: 1943 },
    { gameId: 1942, similarGameId: 472 },
    { gameId: 1942, similarGameId: 11156 },
  ]);
});

test("a game is never similar to itself", () => {
  // IGDB's list is generated, not curated. A self-reference would render the
  // game inside its own Similar Games row.
  const page = mapGames([{ ...FULL_GAME, similar_games: [1942, 472] }]);

  expect(page.gameSimilar).toEqual([{ gameId: 1942, similarGameId: 472 }]);
});

test("a repeated similar id collapses to one row", () => {
  // The table's primary key is (game_id, similar_game_id), so a duplicate
  // inside one page would be a unique violation that fails the whole
  // transaction. Unlike genres, this list is not a curated set we can trust.
  const page = mapGames([{ ...FULL_GAME, similar_games: [472, 472] }]);

  expect(page.gameSimilar).toEqual([{ gameId: 1942, similarGameId: 472 }]);
});

test("an absent similar_games field yields no rows", () => {
  const page = mapGames([{ id: 7, name: "Minimal", slug: "minimal", updated_at: 1700000000 }]);

  expect(page.gameSimilar).toEqual([]);
});
