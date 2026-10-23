import { FREE_ACTIVE_SLOTS } from "@repo/contracts";
import { expect, test } from "vitest";

import { wouldExceedSlots } from "@/features/paywall/should-offer-paywall";

const full = { premium: false, activeCount: FREE_ACTIVE_SLOTS };

test("a premium user never sees the paywall", () => {
  expect(wouldExceedSlots({ ...full, premium: true, from: null, to: "waiting" })).toBe(false);
});

test("adding past a full free tier offers the paywall", () => {
  expect(wouldExceedSlots({ ...full, from: null, to: "waiting" })).toBe(true);
});

test("adding with a slot left does not", () => {
  expect(
    wouldExceedSlots({
      premium: false,
      activeCount: FREE_ACTIVE_SLOTS - 1,
      from: null,
      to: "waiting",
    }),
  ).toBe(false);
});

test("finishing a game at the cap never offers the paywall", () => {
  expect(wouldExceedSlots({ ...full, from: "playing", to: "completed" })).toBe(false);
});

test("shuffling between unfinished statuses at the cap never offers the paywall", () => {
  expect(wouldExceedSlots({ ...full, from: "waiting", to: "playing" })).toBe(false);
});

test("logging an already-finished game at the cap never offers the paywall", () => {
  expect(wouldExceedSlots({ ...full, from: null, to: "completed" })).toBe(false);
});

test("reopening a finished game at the cap offers the paywall", () => {
  expect(wouldExceedSlots({ ...full, from: "completed", to: "playing" })).toBe(true);
});

test("an unknown count does not guess — the server decides", () => {
  expect(
    wouldExceedSlots({ premium: false, activeCount: undefined, from: null, to: "waiting" }),
  ).toBe(false);
});

test("an unknown entitlement does not guess either — a paying user is never refused", () => {
  expect(
    wouldExceedSlots({
      premium: undefined,
      activeCount: FREE_ACTIVE_SLOTS,
      from: null,
      to: "waiting",
    }),
  ).toBe(false);
});
