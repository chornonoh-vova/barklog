import { FREE_ACTIVE_SLOTS, type BacklogStatus } from "@repo/contracts";
import { ensureUser, listBacklog, upsertSubscription } from "@repo/db";
import { afterAll, beforeEach, expect, test } from "vitest";

import { writeBacklogEntry } from "../src/backlog/entry-write.js";
import { createTestApp, OTHER_USER, seedGame, TEST_USER } from "./helpers.js";

const harness = createTestApp();

const GAME_COUNT = FREE_ACTIVE_SLOTS + 2;
const NOW = new Date("2026-10-01T00:00:00Z");

function write(
  gameId: number,
  status: BacklogStatus,
  rating?: number | null,
  userId: string = TEST_USER,
) {
  return writeBacklogEntry(harness.db, { userId, gameId, status, rating }, NOW);
}

async function grantPremium(): Promise<void> {
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "normal",
    purchasedAt: new Date("2026-09-01T00:00:00Z"),
    expiresAt: new Date("2027-09-01T00:00:00Z"),
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 1_000,
  });
}

async function fillSlots(): Promise<void> {
  for (let id = 1; id <= FREE_ACTIVE_SLOTS; id++) {
    const outcome = await write(id, "waiting");
    expect(outcome, `filling slot ${id}`).toMatchObject({ kind: "saved", created: true });
  }
}

beforeEach(async () => {
  await harness.reset();
  // `subscriptions.user_id` references `users.id`, and `backlog_entries` does
  // too, so seed both users before any write.
  await ensureUser(harness.db, TEST_USER);
  await ensureUser(harness.db, OTHER_USER);
  for (let id = 1; id <= GAME_COUNT; id++) {
    await seedGame(harness.db, { id, name: `Game ${id}`, count: 100 });
  }
});

afterAll(async () => {
  await harness.close();
});

test("an unknown game is reported, not written", async () => {
  expect(await write(9999, "waiting")).toEqual({ kind: "unknown-game" });
  expect(await listBacklog(harness.db, { userId: TEST_USER, sort: "updated_at" })).toHaveLength(0);
});

test("a blocked add writes nothing", async () => {
  await fillSlots();

  const outcome = await write(FREE_ACTIVE_SLOTS + 1, "waiting");
  expect(outcome).toEqual({ kind: "capped", activeCount: FREE_ACTIVE_SLOTS, toFree: 1 });

  const rows = await listBacklog(harness.db, { userId: TEST_USER, sort: "updated_at" });
  expect(rows).toHaveLength(FREE_ACTIVE_SLOTS);
});

test("finishing a game frees a slot, so the blocked add then succeeds", async () => {
  await fillSlots();

  expect(await write(1, "completed")).toMatchObject({ kind: "saved", created: false });
  expect(await write(FREE_ACTIVE_SLOTS + 1, "waiting")).toMatchObject({
    kind: "saved",
    created: true,
  });
});

test("a full free tier can still finish a game — the cap must never trap a user", async () => {
  await fillSlots();

  expect(await write(2, "abandoned")).toMatchObject({ kind: "saved", created: false });
});

test("a full free tier can still move between two unfinished statuses", async () => {
  await fillSlots();

  expect(await write(3, "playing")).toMatchObject({ kind: "saved", created: false });
});

test("a full free tier can still change a rating", async () => {
  await fillSlots();

  const outcome = await write(4, "waiting", 8);
  expect(outcome).toMatchObject({ kind: "saved", created: false });
  if (outcome.kind === "saved") expect(outcome.entry.rating).toBe(8);
});

test("reopening a finished game is blocked when the slots are full", async () => {
  await fillSlots();
  await write(1, "completed");
  await write(FREE_ACTIVE_SLOTS + 1, "waiting");

  expect(await write(1, "playing")).toMatchObject({ kind: "capped" });
});

test("a finished game can always be logged, even with the slots full", async () => {
  await fillSlots();

  expect(await write(FREE_ACTIVE_SLOTS + 1, "completed", 10)).toMatchObject({
    kind: "saved",
    created: true,
  });
});

test("a premium user is never blocked", async () => {
  await fillSlots();
  await grantPremium();

  expect(await write(FREE_ACTIVE_SLOTS + 1, "waiting")).toMatchObject({
    kind: "saved",
    created: true,
  });
});

test("an expired subscription is back to the free tier", async () => {
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.monthly",
    store: "app_store",
    periodType: "normal",
    purchasedAt: new Date("2026-07-01T00:00:00Z"),
    expiresAt: new Date("2026-08-01T00:00:00Z"),
    willRenew: false,
    sandbox: false,
    lastEventAtMs: 1_000,
  });
  await fillSlots();

  expect(await write(FREE_ACTIVE_SLOTS + 1, "waiting")).toMatchObject({ kind: "capped" });
});

test("a lapsed subscriber above the cap is told the real distance back", async () => {
  await grantPremium();
  for (let id = 1; id <= GAME_COUNT; id++) {
    expect(await write(id, "waiting"), `adding game ${id} as premium`).toMatchObject({
      kind: "saved",
    });
  }

  // The subscription lapses while more games are unfinished than the free tier
  // allows. `lastEventAtMs` must beat grantPremium's or the upsert is ignored.
  await upsertSubscription(harness.db, {
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "normal",
    purchasedAt: new Date("2026-07-01T00:00:00Z"),
    expiresAt: new Date("2026-08-01T00:00:00Z"),
    willRenew: false,
    sandbox: false,
    lastEventAtMs: 2_000,
  });

  // Nothing is taken away.
  expect(await listBacklog(harness.db, { userId: TEST_USER, sort: "updated_at" })).toHaveLength(
    GAME_COUNT,
  );

  // Finishing is still allowed above the cap, which is the whole point of
  // checking the transition rather than the total.
  expect(await write(1, "completed")).toMatchObject({ kind: "saved" });

  // Reopening it consumes a slot again, so it is refused — and at 11 active,
  // "finish one to free a spot" would be a lie.
  expect(await write(1, "playing")).toEqual({
    kind: "capped",
    activeCount: GAME_COUNT - 1,
    toFree: GAME_COUNT - FREE_ACTIVE_SLOTS,
  });
});

test("the cap counts one user's entries only", async () => {
  await fillSlots();

  expect(await write(FREE_ACTIVE_SLOTS + 1, "waiting", undefined, OTHER_USER)).toMatchObject({
    kind: "saved",
    created: true,
  });
});

test("two concurrent adds at the boundary cannot both win", async () => {
  for (let id = 1; id < FREE_ACTIVE_SLOTS; id++) {
    await write(id, "waiting");
  }

  // One slot, two racers. Without lockUser both read the same count and commit.
  const outcomes = await Promise.all([
    write(FREE_ACTIVE_SLOTS, "waiting"),
    write(FREE_ACTIVE_SLOTS + 1, "waiting"),
  ]);

  expect(outcomes.map((o) => o.kind).sort()).toEqual(["capped", "saved"]);
  expect(await listBacklog(harness.db, { userId: TEST_USER, sort: "updated_at" })).toHaveLength(
    FREE_ACTIVE_SLOTS,
  );
});
