import {
  BACKLOG_STATUSES,
  FREE_ACTIVE_SLOTS,
  SLOT_CONSUMING_STATUSES,
  type BacklogStatsWire,
  type BacklogStatus,
} from "@repo/contracts";
import { expect, test } from "vitest";

import { activeSlotsUsed, slotsLabel } from "@/features/backlog/slots";

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

const onlyOne = (status: BacklogStatus): BacklogStatsWire => ({
  total: 1,
  counts: Object.fromEntries(BACKLOG_STATUSES.map((s) => [s, s === status ? 1 : 0])) as Record<
    BacklogStatus,
    number
  >,
  averageRating: null,
});

// These two drive the whole list, so adding a status to SLOT_CONSUMING_STATUSES
// (or dropping one) fails here unless `activeSlotsUsed` derives from it.
test("every slot-consuming status counts toward the cap", () => {
  for (const status of SLOT_CONSUMING_STATUSES) {
    expect(activeSlotsUsed(onlyOne(status)), status).toBe(1);
  }
});

test("no other status counts toward the cap", () => {
  const consuming = new Set<string>(SLOT_CONSUMING_STATUSES);

  for (const status of BACKLOG_STATUSES.filter((s) => !consuming.has(s))) {
    expect(activeSlotsUsed(onlyOne(status)), status).toBe(0);
  }
});
