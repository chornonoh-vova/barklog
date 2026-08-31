import { sql } from "drizzle-orm";
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { gameGenres, games, gameSimilar, genres } from "../src/schema/index.js";
import { truncateAll } from "../src/testing.js";

const { db, close } = createDb(inject("databaseUrl"));

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("a game round-trips through the mirror tables", async () => {
  await db.insert(genres).values({ id: 12, name: "Role-playing (RPG)", slug: "role-playing-rpg" });
  await db.insert(games).values({
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    totalRatingCount: 4000,
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await db.insert(gameGenres).values({ gameId: 1942, genreId: 12 });

  const rows = await db.select().from(games);

  expect(rows).toHaveLength(1);
  expect(rows[0]!.name).toBe("The Witcher 3: Wild Hunt");
  expect(rows[0]!.totalRatingCount).toBe(4000);
});

test("the trigram index exists on games.name", async () => {
  const result = await db.execute<{ indexdef: string }>(
    sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'games_name_trgm_idx'`,
  );

  expect(result.rows[0]!.indexdef).toContain("gin_trgm_ops");
});

test("parent_game_id is a soft reference with no foreign key", async () => {
  await db.insert(games).values({
    id: 9999,
    name: "Blood and Wine",
    slug: "blood-and-wine",
    parentGameId: 424242, // does not exist
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });

  const rows = await db
    .select()
    .from(games)
    .where(sql`${games.id} = 9999`);
  expect(rows[0]!.parentGameId).toBe(424242);
});

test("similar_game_id is a soft reference with no foreign key", async () => {
  await db.insert(games).values({
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await db.insert(gameSimilar).values({ gameId: 1942, similarGameId: 424242 });

  const rows = await db.select().from(gameSimilar);
  expect(rows).toEqual([{ gameId: 1942, similarGameId: 424242 }]);
});

test("game_similar cascades when its owning game is deleted", async () => {
  await db.insert(games).values({
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await db.insert(gameSimilar).values({ gameId: 1942, similarGameId: 472 });

  await db.delete(games).where(sql`${games.id} = 1942`);

  expect(await db.select().from(gameSimilar)).toHaveLength(0);
});
