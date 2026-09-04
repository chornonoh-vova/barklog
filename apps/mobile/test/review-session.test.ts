import { beforeEach, expect, test } from "vitest";

const { hasSeenPaywallThisSession, markPaywallSeen, resetSession } =
  await import("@/review/session");

beforeEach(resetSession);

test("a fresh launch has not seen the paywall", () => {
  expect(hasSeenPaywallThisSession()).toBe(false);
});

test("the flag survives the paywall's own unmount, so it lasts the whole launch", () => {
  markPaywallSeen();

  expect(hasSeenPaywallThisSession()).toBe(true);
  expect(hasSeenPaywallThisSession()).toBe(true);
});
