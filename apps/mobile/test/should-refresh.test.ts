import { expect, test } from "vitest";

import { entitlementChanged, PREMIUM_ENTITLEMENT } from "@/purchases/should-refresh";

test("the entitlement identifier is the one created in RevenueCat", () => {
  expect(PREMIUM_ENTITLEMENT).toBe("barklog_premium");
});

test("the attach firing only seeds the comparison, so no refresh is spent", () => {
  expect(entitlementChanged(undefined, false)).toBe(false);
  expect(entitlementChanged(undefined, true)).toBe(false);
});

test("a purchase outside the sheet refreshes", () => {
  expect(entitlementChanged(false, true)).toBe(true);
});

test("a lapse refreshes, so the counter comes back", () => {
  expect(entitlementChanged(true, false)).toBe(true);
});

test("the SDK's foreground cache refresh spends nothing", () => {
  expect(entitlementChanged(true, true)).toBe(false);
  expect(entitlementChanged(false, false)).toBe(false);
});
