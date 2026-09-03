import { expect, test } from "vitest";

import * as v from "valibot";

import { mapGameIds, mapGames } from "../src/map.js";

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
  const page = mapGames([FULL_GAME]);

  expect(page.gameCompanies).toEqual([
    { gameId: 1942, companyId: 908, isDeveloper: true, isPublisher: true },
  ]);
  expect(page.companies).toEqual([{ id: 908, name: "CD Projekt RED", slug: "cd-projekt-red" }]);
});

test("a genre shared by two games is emitted once", () => {
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
  const page = mapGames([{ ...FULL_GAME, similar_games: [1942, 472] }]);

  expect(page.gameSimilar).toEqual([{ gameId: 1942, similarGameId: 472 }]);
});

test("a repeated similar id collapses to one row", () => {
  const page = mapGames([{ ...FULL_GAME, similar_games: [472, 472] }]);

  expect(page.gameSimilar).toEqual([{ gameId: 1942, similarGameId: 472 }]);
});

test("an absent similar_games field yields no rows", () => {
  const page = mapGames([{ id: 7, name: "Minimal", slug: "minimal", updated_at: 1700000000 }]);

  expect(page.gameSimilar).toEqual([]);
});

test("an erotic-tagged game contributes no screenshots", () => {
  const page = mapGames([{ ...FULL_GAME, themes: [42] }]);

  expect(page.screenshots).toEqual([]);
});

test("an erotic tag alongside other themes still drops the screenshots", () => {
  const page = mapGames([{ ...FULL_GAME, themes: [1, 42, 17] }]);

  expect(page.screenshots).toEqual([]);
});

test("an erotic-tagged game keeps its row, cover and summary", () => {
  const page = mapGames([{ ...FULL_GAME, themes: [42] }]);

  expect(page.games[0]).toMatchObject({
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    summary: "A story-driven open world RPG.",
    coverImageId: "co1wyy",
  });
  expect(page.gameGenres).toEqual([{ gameId: 1942, genreId: 12 }]);
});

test("themes other than erotic leave the screenshots alone", () => {
  const page = mapGames([{ ...FULL_GAME, themes: [1, 17] }]);

  expect(page.screenshots).toEqual([{ gameId: 1942, imageId: "sc6l7z" }]);
});

test("a game with no themes field keeps its screenshots", () => {
  const page = mapGames([FULL_GAME]);

  expect(page.screenshots).toEqual([{ gameId: 1942, imageId: "sc6l7z" }]);
});

test("one game's erotic tag does not suppress another game's screenshots", () => {
  const page = mapGames([
    { ...FULL_GAME, themes: [42] },
    { ...FULL_GAME, id: 1943, slug: "clean", screenshots: [{ id: 11, image_id: "scclean" }] },
  ]);

  expect(page.screenshots).toEqual([{ gameId: 1943, imageId: "scclean" }]);
});

test("the sweep's id rows map to bare ids", () => {
  expect(mapGameIds([{ id: 123467 }, { id: 286990 }])).toEqual([123467, 286990]);
});

test("an empty sweep page maps to no ids", () => {
  expect(mapGameIds([])).toEqual([]);
});

test("a malformed sweep row is rejected loudly rather than silently dropped", () => {
  expect(() => mapGameIds([{ id: "not-a-number" }])).toThrow(v.ValiError);
});
