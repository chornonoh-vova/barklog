import { FREE_ACTIVE_SLOTS } from "@repo/contracts";
import { ensureUser, upsertSubscription } from "@repo/db";
import { afterAll, beforeEach, expect, test } from "vitest";

import { callApi, createTestApp, seedGame, TEST_USER } from "./helpers.js";

const harness = createTestApp();

const put = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const GAME_COUNT = FREE_ACTIVE_SLOTS + 2;

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
    const response = await callApi(harness.app, `/api/backlog/${id}`, put({ status: "waiting" }));
    expect(response.status, `filling slot ${id}`).toBe(201);
  }
}

beforeEach(async () => {
  await harness.reset();
  // `subscriptions.user_id` references `users.id`, and grantPremium may run
  // before any request has been made — `ensureUserMiddleware` has not created
  // the row yet, so seed it here or the insert fails on the foreign key.
  await ensureUser(harness.db, TEST_USER);
  for (let id = 1; id <= GAME_COUNT; id++) {
    await seedGame(harness.db, { id, name: `Game ${id}`, count: 100 });
  }
});

afterAll(async () => {
  await harness.close();
});

test("a free user fills every slot, and the next unfinished add is 402", async () => {
  await fillSlots();

  const blocked = await callApi(
    harness.app,
    `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`,
    put({ status: "waiting" }),
  );

  expect(blocked.status).toBe(402);
  expect(await blocked.json()).toMatchObject({
    type: "https://barklog.gg/problems/payment-required",
    activeCount: FREE_ACTIVE_SLOTS,
    limit: FREE_ACTIVE_SLOTS,
  });
});

test("a lapsed subscriber above the cap keeps everything and is told the real distance back", async () => {
  await grantPremium();
  for (let id = 1; id <= GAME_COUNT; id++) {
    const added = await callApi(harness.app, `/api/backlog/${id}`, put({ status: "waiting" }));
    expect(added.status, `adding game ${id} as premium`).toBe(201);
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
  const list = await callApi(harness.app, "/api/backlog");
  const body = (await list.json()) as { items: unknown[] };
  expect(body.items).toHaveLength(GAME_COUNT);

  // Finishing is still allowed above the cap, which is the whole point of
  // checking the transition rather than the total.
  const finished = await callApi(harness.app, "/api/backlog/1", put({ status: "completed" }));
  expect(finished.status).toBe(200);

  // Reopening it consumes a slot again, so it is refused — and at 11 active,
  // "finish one to free a spot" would be a lie.
  const blocked = await callApi(harness.app, "/api/backlog/1", put({ status: "playing" }));
  expect(blocked.status).toBe(402);

  const problem = (await blocked.json()) as {
    code: string;
    detail: string;
    activeCount: number;
    limit: number;
    toFree: number;
  };
  expect(problem.code).toBe("backlog_cap_reached");
  expect(problem.activeCount).toBe(GAME_COUNT - 1);
  expect(problem.limit).toBe(FREE_ACTIVE_SLOTS);
  expect(problem.toFree).toBe(GAME_COUNT - FREE_ACTIVE_SLOTS);
  expect(problem.detail).toContain(`Finish ${GAME_COUNT - FREE_ACTIVE_SLOTS}`);
});

test("a move without rating keeps it", async () => {
  await callApi(harness.app, "/api/backlog/1", put({ status: "completed", rating: 8 }));

  const response = await callApi(harness.app, "/api/backlog/1", put({ status: "playing" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "playing", rating: 8 });
});
