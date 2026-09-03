import { ensureUser, schema } from "@repo/db";
import { afterAll, beforeEach, expect, test } from "vitest";

import type { AppDeps } from "../src/types.js";

import { callApi, createTestApp, TEST_USER } from "./helpers.js";

/**
 * Stands in for `verifyWebhook`: trusts the body when the test sends the
 * agreed header, throws otherwise. The real verification is Clerk's, and
 * exercising it here would need a real secret and its wire format.
 */
const verifyClerkWebhook: AppDeps["verifyClerkWebhook"] = async (request) => {
  if (request.headers.get("X-Test-Signature") !== "good") {
    throw new Error("signature verification failed");
  }

  return JSON.parse(await request.text()) as { type: string; data: { id: string } };
};

const harness = createTestApp({ verifyClerkWebhook });

const post = (body: unknown, signature: string | null = "good") => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(signature === null ? {} : { "X-Test-Signature": signature }),
  },
  body: JSON.stringify(body),
  // Not a session route.
  user: null,
});

const deleted = (id = TEST_USER) => ({ type: "user.deleted", data: { id } });

async function seed(): Promise<void> {
  await ensureUser(harness.db, TEST_USER);
  await harness.db.insert(schema.gameTypes).values({ id: 0, name: "Main Game" });
  await harness.db.insert(schema.games).values({
    id: 1,
    name: "Hollow Knight",
    slug: "hollow-knight",
    gameTypeId: 0,
    totalRatingCount: 100,
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await harness.db
    .insert(schema.backlogEntries)
    .values({ userId: TEST_USER, gameId: 1, status: "playing" });
  await harness.db.insert(schema.subscriptions).values({
    userId: TEST_USER,
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "trial",
    purchasedAt: new Date(1_000),
    expiresAt: new Date(5_000),
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 2_000,
  });
  await harness.db.insert(schema.subscriptionEvents).values({
    id: "rc_event_1",
    userId: TEST_USER,
    type: "INITIAL_PURCHASE",
    payload: { app_user_id: TEST_USER, product_id: "premium.yearly", store: "APP_STORE" },
  });
}

beforeEach(async () => {
  await harness.reset();
  await seed();
});

afterAll(async () => {
  await harness.close();
});

test("user.deleted removes the user and cascades the backlog and the subscription", async () => {
  const response = await callApi(harness.app, "/webhooks/clerk", post(deleted()));

  expect(response.status).toBe(200);
  expect(await harness.db.select().from(schema.users)).toHaveLength(0);
  expect(await harness.db.select().from(schema.backlogEntries)).toHaveLength(0);
  expect(await harness.db.select().from(schema.subscriptions)).toHaveLength(0);
});

test("user.deleted tombstones the id", async () => {
  await callApi(harness.app, "/webhooks/clerk", post(deleted()));

  const rows = await harness.db.select().from(schema.deletedUsers);

  expect(rows).toHaveLength(1);
  expect(rows[0]!.id).toBe(TEST_USER);
});

test("the subscription event survives, scrubbed", async () => {
  await callApi(harness.app, "/webhooks/clerk", post(deleted()));

  const rows = await harness.db.select().from(schema.subscriptionEvents);

  expect(rows).toHaveLength(1);
  expect(rows[0]!.userId).toBeNull();
  expect(rows[0]!.payload).not.toHaveProperty("app_user_id");
  expect(rows[0]!.payload).toHaveProperty("product_id", "premium.yearly");
});

test("a delivery that does not verify changes nothing", async () => {
  const response = await callApi(harness.app, "/webhooks/clerk", post(deleted(), "bad"));

  expect(response.status).toBe(401);
  expect(await harness.db.select().from(schema.users)).toHaveLength(1);
});

test("redelivery answers 200 and changes nothing", async () => {
  await callApi(harness.app, "/webhooks/clerk", post(deleted()));
  const second = await callApi(harness.app, "/webhooks/clerk", post(deleted()));

  expect(second.status).toBe(200);
  expect(await harness.db.select().from(schema.users)).toHaveLength(0);
});

test("an unknown user answers 200", async () => {
  const response = await callApi(harness.app, "/webhooks/clerk", post(deleted("user_2nobody")));

  expect(response.status).toBe(200);
  expect(await harness.db.select().from(schema.users)).toHaveLength(1);
});

test("another event type answers 200 and deletes nothing", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/clerk",
    post({ type: "user.updated", data: { id: TEST_USER } }),
  );

  expect(response.status).toBe(200);
  expect(await harness.db.select().from(schema.users)).toHaveLength(1);
});

test("an absent user id answers 200 and deletes nothing", async () => {
  const response = await callApi(
    harness.app,
    "/webhooks/clerk",
    post({ type: "user.deleted", data: { id: "" } }),
  );

  expect(response.status).toBe(200);
  expect(await harness.db.select().from(schema.users)).toHaveLength(1);
});
