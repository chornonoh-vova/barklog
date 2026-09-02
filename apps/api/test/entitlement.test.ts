import type { SubscriptionRow } from "@repo/db";
import { expect, test } from "vitest";

import { isPremium } from "../src/entitlement.js";

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
