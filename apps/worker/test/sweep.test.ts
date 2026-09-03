import { createDb, schema } from "@repo/db";
import { truncateAll } from "@repo/db/testing";
import { PAGE_SIZE } from "@repo/igdb";
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { sweepEroticScreenshots } from "../src/sweep.js";

const { db, close } = createDb(inject("databaseUrl"));

/** Returns `{ id }` rows the way IGDB's `fields id;` response does. */
function stubIgdb(pages: number[][]) {
  const calls: { afterId: number }[] = [];
  let index = 0;
  return {
    calls,
    eroticGameIds: async (options: { afterId: number }) => {
      calls.push(options);
      return (pages[index++] ?? []).map((id) => ({ id }));
    },
  };
}

async function seedGame(id: number, imageIds: string[]) {
  await db.insert(schema.games).values({
    id,
    name: `Game ${id}`,
    slug: `game-${id}`,
    igdbUpdatedAt: new Date(1755000000 * 1000),
  });
  if (imageIds.length > 0) {
    await db
      .insert(schema.gameScreenshots)
      .values(imageIds.map((imageId) => ({ gameId: id, imageId })));
  }
}

const shotsFor = async (gameId: number) =>
  (await db.select().from(schema.gameScreenshots)).filter((row) => row.gameId === gameId);

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("screenshots of an erotic-tagged game are deleted", async () => {
  await seedGame(700, ["scdirty1", "scdirty2"]);

  const removed = await sweepEroticScreenshots({ db, igdb: stubIgdb([[700]]) });

  expect(await shotsFor(700)).toEqual([]);
  expect(removed).toBe(2);
});

test("screenshots of every other game are left alone", async () => {
  await seedGame(700, ["scdirty"]);
  await seedGame(1942, ["scclean"]);

  await sweepEroticScreenshots({ db, igdb: stubIgdb([[700]]) });

  expect(await shotsFor(1942)).toEqual([{ gameId: 1942, imageId: "scclean" }]);
});

test("an erotic id we do not mirror is a no-op rather than an error", async () => {
  await seedGame(1942, ["scclean"]);

  const removed = await sweepEroticScreenshots({ db, igdb: stubIgdb([[999999]]) });

  expect(removed).toBe(0);
  expect(await shotsFor(1942)).toHaveLength(1);
});

test("the game row, its cover and its backlog entries survive the sweep", async () => {
  await seedGame(700, ["scdirty"]);
  await db.update(schema.games).set({ coverImageId: "co700", summary: "A summary." });
  await db.insert(schema.users).values({ id: "user_clerk_1" });
  await db
    .insert(schema.backlogEntries)
    .values({ userId: "user_clerk_1", gameId: 700, status: "playing", rating: 8 });

  await sweepEroticScreenshots({ db, igdb: stubIgdb([[700]]) });

  expect(await db.select().from(schema.games)).toMatchObject([
    { id: 700, coverImageId: "co700", summary: "A summary." },
  ]);
  expect(await db.select().from(schema.backlogEntries)).toMatchObject([
    { userId: "user_clerk_1", gameId: 700, status: "playing", rating: 8 },
  ]);
});

test("a full page is followed by a request keyed past the highest id seen", async () => {
  const full = Array.from({ length: PAGE_SIZE }, (_, i) => i + 1);
  const igdb = stubIgdb([full, [PAGE_SIZE + 1]]);

  await sweepEroticScreenshots({ db, igdb });

  expect(igdb.calls).toEqual([{ afterId: 0 }, { afterId: PAGE_SIZE }]);
});

test("a short page ends the sweep without another request", async () => {
  const igdb = stubIgdb([[700, 701]]);

  await sweepEroticScreenshots({ db, igdb });

  expect(igdb.calls).toEqual([{ afterId: 0 }]);
});

test("an empty first page ends the sweep having deleted nothing", async () => {
  await seedGame(1942, ["scclean"]);
  const igdb = stubIgdb([[]]);

  expect(await sweepEroticScreenshots({ db, igdb })).toBe(0);
  expect(igdb.calls).toHaveLength(1);
  expect(await shotsFor(1942)).toHaveLength(1);
});

test("sweeping twice deletes nothing the second time", async () => {
  await seedGame(700, ["scdirty"]);

  await sweepEroticScreenshots({ db, igdb: stubIgdb([[700]]) });
  const second = await sweepEroticScreenshots({ db, igdb: stubIgdb([[700]]) });

  expect(second).toBe(0);
});
