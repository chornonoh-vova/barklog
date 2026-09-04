import { expect, test } from "vitest";

import { COMPLETIONS_BEFORE_REVIEW, shouldRequestReview } from "@/review/should-request-review";

const ready = { completed: COMPLETIONS_BEFORE_REVIEW, asked: false, sawPaywall: false };

test("asks once the completion threshold is reached", () => {
  expect(shouldRequestReview(ready)).toBe(true);
});

test("asks above the threshold too, for a user who passed it while offline", () => {
  expect(shouldRequestReview({ ...ready, completed: COMPLETIONS_BEFORE_REVIEW + 40 })).toBe(true);
});

test("stays quiet below the threshold", () => {
  expect(shouldRequestReview({ ...ready, completed: COMPLETIONS_BEFORE_REVIEW - 1 })).toBe(false);
});

test("a full backlog of unfinished games is not a reason to ask", () => {
  expect(shouldRequestReview({ ...ready, completed: 0 })).toBe(false);
});

test("never asks twice", () => {
  expect(shouldRequestReview({ ...ready, asked: true })).toBe(false);
});

test("never asks in a session where the paywall was shown", () => {
  expect(shouldRequestReview({ ...ready, sawPaywall: true })).toBe(false);
});

test("unknown stats do not guess — iOS only grants three prompts a year", () => {
  expect(shouldRequestReview({ ...ready, completed: undefined })).toBe(false);
});

test("an unread flag does not guess either, so a re-ask cannot slip through", () => {
  expect(shouldRequestReview({ ...ready, asked: undefined })).toBe(false);
});
