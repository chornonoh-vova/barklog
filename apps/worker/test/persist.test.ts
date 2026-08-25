import { createDb, schema } from "@repo/db";
import { truncateAll } from "@repo/db/testing";
import { mapGames } from "@repo/igdb";
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
  },
];

/**
 * `synced_at` is deliberately excluded: it records when the sync last touched
 * the row, so it is expected to move on every replay. The idempotency
 * guarantee is about the mirrored *data*, not the bookkeeping column.
 */
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
  };
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("replaying the same page leaves the database identical", async () => {
  // Spec §6: a failed run does not advance the watermark, so the next run
  // re-fetches the same range. That is only safe if replay is a no-op.
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
  // Join rows are replaced wholesale, so a genre IGDB dropped must not linger.
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
  // The transaction boundary is per page, so a half-written page cannot exist.
  const page = mapGames(PAGE);
  page.gameGenres.push({ gameId: 999999, genreId: 12 }); // violates the games FK

  await expect(persistPage(db, page)).rejects.toThrow();
  expect(await db.select().from(schema.games)).toHaveLength(0);
});
