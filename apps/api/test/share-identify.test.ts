import { expect, it } from "vitest";

import type { GameSummaryWire } from "../src/serialize.js";
import { mergeCandidates } from "../src/share/identify.js";

const game = (id: number): GameSummaryWire => ({
  id,
  name: `Game ${id}`,
  slug: `game-${id}`,
  coverImageId: null,
  firstReleaseDate: null,
  totalRating: null,
  totalRatingCount: 0,
});

it("keeps guess order, so the first guess's matches rank above the second's", () => {
  const merged = mergeCandidates([[game(1), game(2)], [game(3)]], 10);

  expect(merged.map((item) => item.id)).toEqual([1, 2, 3]);
});

it("dedupes by id, keeping the earliest position", () => {
  const merged = mergeCandidates(
    [
      [game(1), game(2)],
      [game(2), game(3)],
    ],
    10,
  );

  expect(merged.map((item) => item.id)).toEqual([1, 2, 3]);
});

it("caps at the limit", () => {
  const merged = mergeCandidates([[game(1), game(2), game(3)]], 2);

  expect(merged.map((item) => item.id)).toEqual([1, 2]);
});

it("is empty for no guesses", () => {
  expect(mergeCandidates([], 10)).toEqual([]);
});

it("skips a guess that matched nothing without disturbing the order", () => {
  const merged = mergeCandidates([[], [game(7)]], 10);

  expect(merged.map((item) => item.id)).toEqual([7]);
});
