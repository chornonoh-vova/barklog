import { afterAll, beforeEach, describe, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { backlogEntries, games, users } from "../src/schema/index.js";
import { truncateAll } from "../src/testing.js";
import { expectRejectedBy } from "./helpers.js";

const { db, close } = createDb(inject("databaseUrl"));

beforeEach(async () => {
  await truncateAll(db);
  await db.insert(users).values({ id: "user_alice" });
  await db.insert(games).values([
    { id: 1, name: "Hades", slug: "hades", igdbUpdatedAt: new Date() },
    { id: 2, name: "Celeste", slug: "celeste", igdbUpdatedAt: new Date() },
  ]);
});

afterAll(async () => {
  await close();
});

describe("exactly one status per game", () => {
  test("a second entry for the same (user, game) is rejected", async () => {
    await db.insert(backlogEntries).values({ userId: "user_alice", gameId: 1, status: "playing" });

    await expectRejectedBy(
      db.insert(backlogEntries).values({ userId: "user_alice", gameId: 1, status: "completed" }),
      /duplicate key value/i,
    );
  });

  test("the same game for a different user is allowed", async () => {
    await db.insert(users).values({ id: "user_bob" });
    await db.insert(backlogEntries).values({ userId: "user_alice", gameId: 1, status: "playing" });
    await db.insert(backlogEntries).values({ userId: "user_bob", gameId: 1, status: "waiting" });

    const rows = await db.select().from(backlogEntries);
    expect(rows).toHaveLength(2);
  });
});

describe("rating range", () => {
  test.each([0, 11, -1, 100])("rating %i is rejected", async (rating) => {
    await expectRejectedBy(
      db.insert(backlogEntries).values({
        userId: "user_alice",
        gameId: 1,
        status: "completed",
        rating,
      }),
      /backlog_entries_rating_range/,
    );
  });

  test.each([1, 5, 10])("rating %i is accepted", async (rating) => {
    await db.insert(backlogEntries).values({
      userId: "user_alice",
      gameId: 2,
      status: "completed",
      rating,
    });

    const rows = await db.select().from(backlogEntries);
    expect(rows[0]!.rating).toBe(rating);
  });

  test("rating is optional", async () => {
    await db.insert(backlogEntries).values({ userId: "user_alice", gameId: 1, status: "waiting" });

    const rows = await db.select().from(backlogEntries);
    expect(rows[0]!.rating).toBeNull();
  });
});

test("an unknown status value is rejected by the enum", async () => {
  await expectRejectedBy(
    db.execute(
      "INSERT INTO backlog_entries (user_id, game_id, status) VALUES ('user_alice', 1, 'someday')",
    ),
    /invalid input value for enum/i,
  );
});

test("deleting a user removes their entries", async () => {
  await db.insert(backlogEntries).values({ userId: "user_alice", gameId: 1, status: "playing" });
  await db.execute("DELETE FROM users WHERE id = 'user_alice'");

  const rows = await db.select().from(backlogEntries);
  expect(rows).toHaveLength(0);
});
