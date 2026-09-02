import { FREE_ACTIVE_SLOTS, type BacklogStatsWire } from "@repo/contracts";
import { expect, test } from "vitest";

import { slotsLabel } from "@/features/backlog/slots";

const stats = (waiting: number, playing: number): BacklogStatsWire => ({
  // `total` is every status summed, which is what getBacklogStats returns —
  // and deliberately NOT waiting + playing, so a regression reading `total`
  // instead of the two unfinished counts fails these tests.
  total: waiting + playing + 12 + 3,
  counts: { waiting, playing, completed: 12, abandoned: 3 },
  averageRating: 7.5,
});

test("premium users see no counter at all", () => {
  expect(slotsLabel(stats(4, 2), true)).toBeNull();
});

test("the counter shows unfinished games against the cap", () => {
  expect(slotsLabel(stats(7, 2), false)).toBe(`9 of ${FREE_ACTIVE_SLOTS} spots used`);
});

test("finished games do not count toward the cap", () => {
  expect(slotsLabel(stats(1, 0), false)).toBe(`1 of ${FREE_ACTIVE_SLOTS} spots used`);
});

test("a full backlog says how to free a spot rather than just refusing", () => {
  expect(slotsLabel(stats(FREE_ACTIVE_SLOTS, 0), false)).toBe(
    "All spots full — finish a game to free one",
  );
});

test("an over-full backlog still reads sensibly, in case a plan change lowered the cap", () => {
  expect(slotsLabel(stats(FREE_ACTIVE_SLOTS + 3, 0), false)).toBe(
    "All spots full — finish a game to free one",
  );
});

test("nothing is shown before stats load", () => {
  expect(slotsLabel(undefined, false)).toBeNull();
});
