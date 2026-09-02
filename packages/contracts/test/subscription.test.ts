import { expect, test } from "vitest";

import { FREE_ACTIVE_SLOTS, SLOT_CONSUMING_STATUSES, slotDelta } from "../src/subscription.js";

test("the free tier holds ten unfinished games", () => {
  expect(FREE_ACTIVE_SLOTS).toBe(10);
});

test("only waiting and playing consume a slot", () => {
  expect([...SLOT_CONSUMING_STATUSES]).toEqual(["waiting", "playing"]);
});

test("a new unfinished entry consumes a slot", () => {
  expect(slotDelta(null, "waiting")).toBe(1);
  expect(slotDelta(null, "playing")).toBe(1);
});

test("a new finished entry consumes nothing, so a finished game can always be logged", () => {
  expect(slotDelta(null, "completed")).toBe(0);
  expect(slotDelta(null, "abandoned")).toBe(0);
});

test("reopening a finished game consumes a slot", () => {
  expect(slotDelta("completed", "waiting")).toBe(1);
  expect(slotDelta("abandoned", "playing")).toBe(1);
});

test("finishing a game frees its slot — the whole point of the mechanic", () => {
  expect(slotDelta("waiting", "completed")).toBe(-1);
  expect(slotDelta("playing", "abandoned")).toBe(-1);
});

test("moving between two unfinished statuses is free", () => {
  expect(slotDelta("waiting", "playing")).toBe(0);
  expect(slotDelta("playing", "waiting")).toBe(0);
});

test("moving between two finished statuses is free", () => {
  expect(slotDelta("completed", "abandoned")).toBe(0);
});

test("a rating-only change cannot consume a slot", () => {
  for (const status of ["waiting", "playing", "completed", "abandoned"] as const) {
    expect(slotDelta(status, status)).toBe(0);
  }
});
