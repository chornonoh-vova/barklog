import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { ensureUser } from "../src/queries/backlog.js";
import { deleteUser, scrubSubscriptionEvents } from "../src/queries/users.js";
import * as schema from "../src/schema/index.js";
import { truncateAll } from "../src/testing.js";

const { db, close } = createDb(inject("databaseUrl"));

const USER = "user_2deleteAAA";

const rawEvent = {
  id: "rc_event_1",
  type: "INITIAL_PURCHASE",
  app_user_id: USER,
  event_timestamp_ms: 2_000,
  product_id: "gg.barklog.app.premium.yearly",
  store: "APP_STORE",
  period_type: "TRIAL",
  purchased_at_ms: 1_000,
  expiration_at_ms: 5_000,
  environment: "PRODUCTION",
  aliases: [USER, "anon_123"],
  subscriber_attributes: { $email: { value: "someone@example.com" } },
  transaction_id: "2000000123456789",
};

async function seed(): Promise<void> {
  await ensureUser(db, USER);
  await db.insert(schema.gameTypes).values({ id: 0, name: "Main Game" });
  await db.insert(schema.games).values({
    id: 1,
    name: "Hollow Knight",
    slug: "hollow-knight",
    gameTypeId: 0,
    totalRatingCount: 100,
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await db.insert(schema.backlogEntries).values({ userId: USER, gameId: 1, status: "playing" });
  await db.insert(schema.subscriptions).values({
    userId: USER,
    productId: "gg.barklog.app.premium.yearly",
    store: "app_store",
    periodType: "trial",
    purchasedAt: new Date(1_000),
    expiresAt: new Date(5_000),
    willRenew: true,
    sandbox: false,
    lastEventAtMs: 2_000,
  });
  await db.insert(schema.subscriptionEvents).values({
    id: "rc_event_1",
    userId: USER,
    type: "INITIAL_PURCHASE",
    payload: rawEvent,
  });
}

beforeEach(async () => {
  await truncateAll(db);
  await seed();
});

afterAll(async () => {
  await close();
});

test("deleteUser cascades the backlog and the subscription", async () => {
  await expect(deleteUser(db, USER)).resolves.toBe(true);

  expect(await db.select().from(schema.users)).toHaveLength(0);
  expect(await db.select().from(schema.backlogEntries)).toHaveLength(0);
  expect(await db.select().from(schema.subscriptions)).toHaveLength(0);
});

test("deleteUser is idempotent for an absent user", async () => {
  await expect(deleteUser(db, "user_2nobody")).resolves.toBe(false);
  expect(await db.select().from(schema.users)).toHaveLength(1);
});

test("scrubSubscriptionEvents keeps the row, drops the identifiers", async () => {
  await expect(scrubSubscriptionEvents(db, USER)).resolves.toBe(1);

  const rows = await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.id, "rc_event_1"));

  expect(rows).toHaveLength(1);
  expect(rows[0].userId).toBeNull();
  // The row still identifies the product and the period, which is what
  // revenue queries group by.
  expect(rows[0].payload).toEqual({
    product_id: "gg.barklog.app.premium.yearly",
    store: "APP_STORE",
    period_type: "TRIAL",
    purchased_at_ms: 1_000,
    expiration_at_ms: 5_000,
    environment: "PRODUCTION",
  });
});

test("scrubSubscriptionEvents drops fields RevenueCat adds later", async () => {
  await db.insert(schema.subscriptionEvents).values({
    id: "rc_event_2",
    userId: USER,
    type: "RENEWAL",
    payload: { ...rawEvent, id: "rc_event_2", some_future_field: "leaks-if-droplist" },
  });

  await expect(scrubSubscriptionEvents(db, USER)).resolves.toBe(2);

  const rows = await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.id, "rc_event_2"));

  expect(rows[0].payload).not.toHaveProperty("some_future_field");
  expect(rows[0].payload).not.toHaveProperty("transaction_id");
});

test("scrubSubscriptionEvents leaves other users alone", async () => {
  await ensureUser(db, "user_2otherBBB");
  await db.insert(schema.subscriptionEvents).values({
    id: "rc_event_other",
    userId: "user_2otherBBB",
    type: "RENEWAL",
    payload: rawEvent,
  });

  await expect(scrubSubscriptionEvents(db, USER)).resolves.toBe(1);

  const rows = await db
    .select()
    .from(schema.subscriptionEvents)
    .where(eq(schema.subscriptionEvents.id, "rc_event_other"));

  expect(rows[0].userId).toBe("user_2otherBBB");
});
