import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import {
  countBacklogEntriesByStatus,
  deleteBacklogEntry,
  ensureUser,
  getBacklogEntry,
  getBacklogStats,
  listBacklog,
  lockUser,
  upsertBacklogEntry,
} from "../src/queries/backlog.js";
import * as schema from "../src/schema/index.js";
import { truncateAll } from "../src/testing.js";

const { db, close } = createDb(inject("databaseUrl"));

const USER = "user_2abcDEF";
const OTHER = "user_2xyzGHI";

async function seedGames(): Promise<void> {
  await db.insert(schema.gameTypes).values({ id: 0, name: "Main Game" }).onConflictDoNothing();
  await db.insert(schema.games).values([
    {
      id: 1,
      name: "Alpha Protocol",
      slug: "alpha-protocol",
      gameTypeId: 0,
      totalRatingCount: 100,
      igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: 2,
      name: "Beta Decay",
      slug: "beta-decay",
      gameTypeId: 0,
      totalRatingCount: 200,
      igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: 3,
      name: "Chrono Trigger",
      slug: "chrono-trigger",
      gameTypeId: 0,
      totalRatingCount: 300,
      igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ]);
}

beforeEach(async () => {
  await truncateAll(db);
  await seedGames();
  await ensureUser(db, USER);
  await ensureUser(db, OTHER);
});

afterAll(async () => {
  await close();
});

test("ensureUser is idempotent, which is what makes it safe in middleware", async () => {
  await ensureUser(db, USER);
  await ensureUser(db, USER);

  const rows = await db.select({ id: schema.users.id }).from(schema.users);
  expect(rows.map((row) => row.id).sort()).toEqual([USER, OTHER].sort());
});

test("the first upsert creates and the second updates the same row", async () => {
  const first = await upsertBacklogEntry(db, {
    userId: USER,
    gameId: 1,
    status: "waiting",
    rating: null,
  });
  expect(first.created).toBe(true);
  expect(first.entry.status).toBe("waiting");

  const second = await upsertBacklogEntry(db, {
    userId: USER,
    gameId: 1,
    status: "completed",
    rating: 9,
  });
  expect(second.created).toBe(false);
  expect(second.entry.status).toBe("completed");
  expect(second.entry.rating).toBe(9);

  const rows = await db
    .select({ gameId: schema.backlogEntries.gameId })
    .from(schema.backlogEntries);
  expect(rows).toHaveLength(1);
});

test("an update advances updated_at but leaves added_at alone", async () => {
  const created = await upsertBacklogEntry(db, {
    userId: USER,
    gameId: 1,
    status: "waiting",
    rating: null,
  });
  const updated = await upsertBacklogEntry(db, {
    userId: USER,
    gameId: 1,
    status: "playing",
    rating: null,
  });

  expect(updated.entry.addedAt.getTime()).toBe(created.entry.addedAt.getTime());
  expect(updated.entry.updatedAt.getTime()).toBeGreaterThanOrEqual(
    created.entry.updatedAt.getTime(),
  );
});

test("a rating can be cleared by writing null", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "completed", rating: 8 });
  const cleared = await upsertBacklogEntry(db, {
    userId: USER,
    gameId: 1,
    status: "completed",
    rating: null,
  });

  expect(cleared.entry.rating).toBeNull();
});

test("two users hold independent entries for the same game", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: OTHER, gameId: 1, status: "abandoned", rating: 2 });

  expect((await getBacklogEntry(db, USER, 1))?.status).toBe("playing");
  expect((await getBacklogEntry(db, OTHER, 1))?.status).toBe("abandoned");
  expect(await getBacklogEntry(db, USER, 2)).toBeNull();
});

test("delete reports whether it removed anything", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "playing", rating: null });

  expect(await deleteBacklogEntry(db, USER, 1)).toBe(true);
  expect(await deleteBacklogEntry(db, USER, 1)).toBe(false);
  expect(await deleteBacklogEntry(db, USER, 999)).toBe(false);
});

test("the list joins game summaries and filters by status", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 2, status: "completed", rating: 7 });
  await upsertBacklogEntry(db, { userId: OTHER, gameId: 3, status: "playing", rating: null });

  const all = await listBacklog(db, { userId: USER });
  expect(all).toHaveLength(2);
  expect(all[0]?.game.name).toBeDefined();

  const playing = await listBacklog(db, { userId: USER, status: "playing" });
  expect(playing.map((item) => item.gameId)).toEqual([1]);
});

test("each sort orders the way the spec says, with rating nulls last", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 3, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "completed", rating: 4 });
  await upsertBacklogEntry(db, { userId: USER, gameId: 2, status: "completed", rating: 10 });

  const byName = await listBacklog(db, { userId: USER, sort: "name" });
  expect(byName.map((item) => item.game.name)).toEqual([
    "Alpha Protocol",
    "Beta Decay",
    "Chrono Trigger",
  ]);

  const byRating = await listBacklog(db, { userId: USER, sort: "rating" });
  expect(byRating.map((item) => item.rating)).toEqual([10, 4, null]);

  const byAdded = await listBacklog(db, { userId: USER, sort: "added_at" });
  expect(byAdded.map((item) => item.gameId)).toEqual([2, 1, 3]);
});

test("the list honours a limit, which is how the soft cap is enforced", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 2, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 3, status: "playing", rating: null });

  expect(await listBacklog(db, { userId: USER, limit: 2 })).toHaveLength(2);
});

test("stats count every status and average only the rated entries", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "completed", rating: 8 });
  await upsertBacklogEntry(db, { userId: USER, gameId: 2, status: "completed", rating: 6 });
  await upsertBacklogEntry(db, { userId: USER, gameId: 3, status: "waiting", rating: null });
  await upsertBacklogEntry(db, { userId: OTHER, gameId: 1, status: "playing", rating: 1 });

  expect(await getBacklogStats(db, USER)).toEqual({
    total: 3,
    counts: { waiting: 1, playing: 0, completed: 2, abandoned: 0 },
    averageRating: 7,
  });
});

test("stats for an empty backlog are zeroes and a null average", async () => {
  expect(await getBacklogStats(db, USER)).toEqual({
    total: 0,
    counts: { waiting: 0, playing: 0, completed: 0, abandoned: 0 },
    averageRating: null,
  });
});

test("countBacklogEntriesByStatus counts only the statuses it is given", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "waiting", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 2, status: "playing", rating: null });
  await upsertBacklogEntry(db, { userId: USER, gameId: 3, status: "completed", rating: null });

  expect(await countBacklogEntriesByStatus(db, USER, ["waiting", "playing"])).toBe(2);
  expect(await countBacklogEntriesByStatus(db, USER, ["completed"])).toBe(1);
  expect(await countBacklogEntriesByStatus(db, USER, ["abandoned"])).toBe(0);
});

test("countBacklogEntriesByStatus counts one user's entries only", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "waiting", rating: null });
  await upsertBacklogEntry(db, { userId: OTHER, gameId: 2, status: "waiting", rating: null });

  expect(await countBacklogEntriesByStatus(db, USER, ["waiting", "playing"])).toBe(1);
});

test("an empty status list counts nothing rather than everything", async () => {
  await upsertBacklogEntry(db, { userId: USER, gameId: 1, status: "waiting", rating: null });

  expect(await countBacklogEntriesByStatus(db, USER, [])).toBe(0);
});

test("lockUser serialises two transactions on the same user", async () => {
  const order: string[] = [];

  const first = db.transaction(async (tx) => {
    await lockUser(tx, USER);
    order.push("first-locked");
    await new Promise((resolve) => setTimeout(resolve, 150));
    order.push("first-releasing");
  });

  // A beat, so the first transaction certainly holds the lock.
  await new Promise((resolve) => setTimeout(resolve, 30));

  const second = db.transaction(async (tx) => {
    await lockUser(tx, USER);
    order.push("second-locked");
  });

  await Promise.all([first, second]);

  expect(order).toEqual(["first-locked", "first-releasing", "second-locked"]);
});
