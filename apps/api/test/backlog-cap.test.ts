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

test("a blocked add writes nothing", async () => {
  await fillSlots();
  await callApi(harness.app, `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`, put({ status: "waiting" }));

  const list = await callApi(harness.app, "/api/backlog");
  const body = (await list.json()) as { items: unknown[] };
  expect(body.items).toHaveLength(FREE_ACTIVE_SLOTS);
});

test("finishing a game frees a slot, so the blocked add then succeeds", async () => {
  await fillSlots();

  const finished = await callApi(harness.app, "/api/backlog/1", put({ status: "completed" }));
  expect(finished.status).toBe(200);

  const retried = await callApi(
    harness.app,
    `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`,
    put({ status: "waiting" }),
  );
  expect(retried.status).toBe(201);
});

test("a full free tier can still finish a game — the cap must never trap a user", async () => {
  await fillSlots();

  const response = await callApi(harness.app, "/api/backlog/2", put({ status: "abandoned" }));
  expect(response.status).toBe(200);
});

test("a full free tier can still move between two unfinished statuses", async () => {
  await fillSlots();

  const response = await callApi(harness.app, "/api/backlog/3", put({ status: "playing" }));
  expect(response.status).toBe(200);
});

test("a full free tier can still change a rating", async () => {
  await fillSlots();

  const response = await callApi(
    harness.app,
    "/api/backlog/4",
    put({ status: "waiting", rating: 8 }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ rating: 8 });
});

test("reopening a finished game is blocked when the slots are full", async () => {
  await fillSlots();
  await callApi(harness.app, "/api/backlog/1", put({ status: "completed" }));
  await callApi(harness.app, `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`, put({ status: "waiting" }));

  const reopened = await callApi(harness.app, "/api/backlog/1", put({ status: "playing" }));
  expect(reopened.status).toBe(402);
});

test("a finished game can always be logged, even with the slots full", async () => {
  await fillSlots();

  const response = await callApi(
    harness.app,
    `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`,
    put({ status: "completed", rating: 10 }),
  );
  expect(response.status).toBe(201);
});

test("a premium user is never blocked", async () => {
  await fillSlots();
  await grantPremium();

  const response = await callApi(
    harness.app,
    `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`,
    put({ status: "waiting" }),
  );
  expect(response.status).toBe(201);
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

  const response = await callApi(
    harness.app,
    `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`,
    put({ status: "waiting" }),
  );
  expect(response.status).toBe(402);
});

test("the cap counts one user's entries only", async () => {
  await fillSlots();

  const other = await callApi(harness.app, `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`, {
    ...put({ status: "waiting" }),
    user: "user_2testBBB",
  });
  expect(other.status).toBe(201);
});

test("two concurrent adds at the boundary cannot both win", async () => {
  for (let id = 1; id < FREE_ACTIVE_SLOTS; id++) {
    await callApi(harness.app, `/api/backlog/${id}`, put({ status: "waiting" }));
  }

  // One slot, two racers. Without lockUser both read the same count and commit.
  const [first, second] = await Promise.all([
    callApi(harness.app, `/api/backlog/${FREE_ACTIVE_SLOTS}`, put({ status: "waiting" })),
    callApi(harness.app, `/api/backlog/${FREE_ACTIVE_SLOTS + 1}`, put({ status: "waiting" })),
  ]);

  const statuses = [first.status, second.status].sort();
  expect(statuses).toEqual([201, 402]);

  const list = await callApi(harness.app, "/api/backlog");
  const body = (await list.json()) as { items: unknown[] };
  expect(body.items).toHaveLength(FREE_ACTIVE_SLOTS);
});
