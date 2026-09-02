import { afterAll, beforeEach, expect, test } from "vitest";
import { inject } from "vitest";

import { createDb } from "../src/client.js";
import { ensureUser } from "../src/queries/backlog.js";
import {
  getSubscription,
  recordSubscriptionEvent,
  upsertSubscription,
} from "../src/queries/subscriptions.js";
import { truncateAll } from "../src/testing.js";

const USER = "user_2testAAA";

const { db, close } = createDb(inject("databaseUrl"));

const row = (overrides: Partial<Parameters<typeof upsertSubscription>[1]> = {}) => ({
  userId: USER,
  productId: "gg.barklog.app.premium.yearly",
  store: "app_store" as const,
  periodType: "trial" as const,
  purchasedAt: new Date("2026-09-01T00:00:00Z"),
  expiresAt: new Date("2026-09-08T00:00:00Z"),
  willRenew: true,
  sandbox: false,
  lastEventAtMs: 1_000,
  ...overrides,
});

beforeEach(async () => {
  await truncateAll(db);
  await ensureUser(db, USER);
});

afterAll(async () => {
  await close();
});

test("getSubscription returns null before anything is recorded", async () => {
  expect(await getSubscription(db, USER)).toBeNull();
});

test("upsertSubscription inserts, then replaces on a later event", async () => {
  await upsertSubscription(db, row());
  await upsertSubscription(db, row({ periodType: "normal", lastEventAtMs: 2_000 }));

  const stored = await getSubscription(db, USER);
  expect(stored).toMatchObject({ periodType: "normal", lastEventAtMs: 2_000 });
});

test("a stale event does not overwrite a newer row", async () => {
  await upsertSubscription(db, row({ periodType: "normal", lastEventAtMs: 2_000 }));
  await upsertSubscription(db, row({ periodType: "trial", lastEventAtMs: 1_000 }));

  const stored = await getSubscription(db, USER);
  expect(stored).toMatchObject({ periodType: "normal", lastEventAtMs: 2_000 });
});

test("an event at exactly the stored timestamp still applies, so a redelivery is not lost", async () => {
  await upsertSubscription(db, row({ willRenew: true, lastEventAtMs: 2_000 }));
  await upsertSubscription(db, row({ willRenew: false, lastEventAtMs: 2_000 }));

  expect(await getSubscription(db, USER)).toMatchObject({ willRenew: false });
});

test("getSubscription returns expired and sandbox rows verbatim — judging is not its job", async () => {
  await upsertSubscription(db, row({ expiresAt: new Date("2020-01-01T00:00:00Z"), sandbox: true }));

  const stored = await getSubscription(db, USER);
  expect(stored).toMatchObject({ sandbox: true });
  expect(stored?.expiresAt?.getFullYear()).toBe(2020);
});

test("a null expiresAt round-trips as lifetime rather than becoming a date", async () => {
  await upsertSubscription(db, row({ expiresAt: null }));

  expect(await getSubscription(db, USER)).toMatchObject({ expiresAt: null });
});

test("recordSubscriptionEvent is idempotent on the RevenueCat event id", async () => {
  const event = {
    id: "rc_event_1",
    userId: USER,
    type: "INITIAL_PURCHASE",
    payload: { id: "rc_event_1" },
  };

  expect(await recordSubscriptionEvent(db, event)).toBe(true);
  expect(await recordSubscriptionEvent(db, event)).toBe(false);
});

test("an event for an unknown user is logged, because the column is not a foreign key", async () => {
  const recorded = await recordSubscriptionEvent(db, {
    id: "rc_event_2",
    userId: "user_never_seen",
    type: "INITIAL_PURCHASE",
    payload: {},
  });

  expect(recorded).toBe(true);
});
