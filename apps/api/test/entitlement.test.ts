import { ensureUser, upsertSubscription } from "@repo/db";
import type { SubscriptionRow } from "@repo/db";
import { afterAll, beforeEach, expect, test } from "vitest";

import { isPremium, readEntitlement } from "../src/entitlement.js";
import { createTestApp, TEST_USER } from "./helpers.js";

const harness = createTestApp();

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await harness.reset();
});

const NOW = new Date("2026-09-05T00:00:00Z");

const row = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  userId: "user_2testAAA",
  productId: "gg.barklog.app.premium.yearly",
  store: "app_store",
  periodType: "trial",
  purchasedAt: new Date("2026-09-01T00:00:00Z"),
  expiresAt: new Date("2026-09-08T00:00:00Z"),
  willRenew: true,
  sandbox: false,
  lastEventAtMs: 1_000,
  ...overrides,
});

test("no row is not premium", () => {
  expect(isPremium(null, NOW)).toBe(false);
});

test("an unexpired row is premium", () => {
  expect(isPremium(row(), NOW)).toBe(true);
});

test("an expired row is not premium, with no webhook needed to say so", () => {
  expect(isPremium(row({ expiresAt: new Date("2026-09-04T00:00:00Z") }), NOW)).toBe(false);
});

test("a null expiresAt is a lifetime entitlement", () => {
  expect(isPremium(row({ expiresAt: null }), NOW)).toBe(true);
});

test("expiry exactly now has lapsed", () => {
  expect(isPremium(row({ expiresAt: NOW }), NOW)).toBe(false);
});

test("a sandbox purchase grants premium — App Review buys in the sandbox", () => {
  expect(isPremium(row({ sandbox: true }), NOW)).toBe(true);
});

test("a cancelled but unexpired subscription is still premium until it lapses", () => {
  expect(isPremium(row({ willRenew: false }), NOW)).toBe(true);
});

test("no subscription reads as free with no entitlement", async () => {
  await ensureUser(harness.db, TEST_USER);

  expect(await readEntitlement(harness.db, TEST_USER, NOW)).toEqual({
    premium: false,
    entitlement: null,
  });
});

test("an active subscription reads as premium with its wire entitlement", async () => {
  await ensureUser(harness.db, TEST_USER);
  const { userId: _userId, ...rest } = row();
  await upsertSubscription(harness.db, { ...rest, userId: TEST_USER });

  expect(await readEntitlement(harness.db, TEST_USER, NOW)).toEqual({
    premium: true,
    entitlement: {
      productId: "gg.barklog.app.premium.yearly",
      store: "app_store",
      periodType: "trial",
      expiresAt: "2026-09-08T00:00:00.000Z",
      willRenew: true,
    },
  });
});
