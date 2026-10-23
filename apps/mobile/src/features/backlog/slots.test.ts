import {
  BACKLOG_STATUSES,
  FREE_ACTIVE_SLOTS,
  SLOT_CONSUMING_STATUSES,
  type BacklogListItemWire,
  type BacklogStatus,
} from "@repo/contracts";

import { activeSlotsUsed, countStatus, slotsLabel } from "@/features/backlog/slots";

const entry = (gameId: number, status: BacklogStatus): BacklogListItemWire => ({
  gameId,
  status,
  rating: null,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  game: {
    id: gameId,
    name: `Game ${gameId}`,
    slug: `game-${gameId}`,
    coverImageId: null,
    firstReleaseDate: null,
    totalRating: null,
    totalRatingCount: 0,
  },
});

const ofStatus = (status: BacklogStatus, count: number, from: number) =>
  Array.from({ length: count }, (_, i) => entry(from + i, status));

// Finished games are in the list too, so a regression counting every item
// instead of the two unfinished statuses fails these tests.
const items = (waiting: number, playing: number): BacklogListItemWire[] => [
  ...ofStatus("waiting", waiting, 0),
  ...ofStatus("playing", playing, 1000),
  ...ofStatus("completed", 12, 2000),
  ...ofStatus("abandoned", 3, 3000),
];

test("premium users see no counter at all", () => {
  expect(slotsLabel(items(4, 2), true)).toBeNull();
});

test("the counter shows unfinished games against the cap", () => {
  expect(slotsLabel(items(7, 2), false)).toBe(`9 of ${FREE_ACTIVE_SLOTS} spots used`);
});

test("finished games do not count toward the cap", () => {
  expect(slotsLabel(items(1, 0), false)).toBe(`1 of ${FREE_ACTIVE_SLOTS} spots used`);
});

test("a full backlog says how to free a spot rather than just refusing", () => {
  expect(slotsLabel(items(FREE_ACTIVE_SLOTS, 0), false)).toBe(
    "All spots full — finish a game to free one",
  );
});

test("an over-full backlog still reads sensibly, in case a plan change lowered the cap", () => {
  expect(slotsLabel(items(FREE_ACTIVE_SLOTS + 3, 0), false)).toBe(
    "All spots full — finish a game to free one",
  );
});

test("nothing is shown before the list loads", () => {
  expect(slotsLabel(undefined, false)).toBeNull();
});

const onlyOne = (status: BacklogStatus) => [entry(1, status)];

// These two drive the whole list, so adding a status to SLOT_CONSUMING_STATUSES
// (or dropping one) fails here unless `activeSlotsUsed` derives from it.
test("every slot-consuming status counts toward the cap", () => {
  for (const status of SLOT_CONSUMING_STATUSES) {
    expect({ [status]: activeSlotsUsed(onlyOne(status)) }).toEqual({ [status]: 1 });
  }
});

test("no other status counts toward the cap", () => {
  const consuming = new Set<string>(SLOT_CONSUMING_STATUSES);

  for (const status of BACKLOG_STATUSES.filter((s) => !consuming.has(s))) {
    expect({ [status]: activeSlotsUsed(onlyOne(status)) }).toEqual({ [status]: 0 });
  }
});

test("countStatus counts one status only", () => {
  expect(countStatus(items(2, 5), "completed")).toBe(12);
  expect(countStatus(items(2, 5), "waiting")).toBe(2);
  expect(countStatus([], "playing")).toBe(0);
});
