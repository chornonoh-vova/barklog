import { describe, expect, it } from "vitest";

import {
  chunk,
  columnCount,
  DETAIL_SPLIT_MIN_WIDTH,
  detailIsSplit,
  MAX_COLUMNS,
  prefersSheet,
  SHEET_MIN_WIDTH,
} from "@/ui/columns";

describe("columnCount", () => {
  it.each([
    { width: 402, fontScale: 1, expected: 1, context: "iPhone portrait" },
    { width: 440, fontScale: 1, expected: 1, context: "iPhone Pro Max portrait" },
    { width: 744, fontScale: 1, expected: 2, context: "iPad mini portrait" },
    { width: 956, fontScale: 1, expected: 2, context: "iPhone Pro Max landscape" },
    { width: 1050, fontScale: 1, expected: 3, context: "13-inch iPad landscape, sidebar open" },
    { width: 1376, fontScale: 1, expected: 3, context: "13-inch iPad landscape, capped" },
    { width: 744, fontScale: 1.35, expected: 1, context: "iPad mini, larger text" },
    { width: 1376, fontScale: 3, expected: 2, context: "13-inch iPad, AX5 (scale capped)" },
    { width: 402, fontScale: 0.8, expected: 1, context: "iPhone, smallest text" },
  ])("$context ($width pt, x$fontScale) → $expected", ({ width, fontScale, expected }) => {
    expect(columnCount(width, fontScale)).toBe(expected);
  });

  it("never exceeds MAX_COLUMNS however wide", () => {
    expect(columnCount(10_000, 1)).toBe(MAX_COLUMNS);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to one column for an unusable width (%s)",
    (width) => {
      expect(columnCount(width, 1)).toBe(1);
    },
  );

  it("treats an unusable fontScale as 1", () => {
    expect(columnCount(744, Number.NaN)).toBe(columnCount(744, 1));
    expect(columnCount(744, 0)).toBe(columnCount(744, 1));
  });
});

describe("chunk", () => {
  it("returns no rows for no items", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("fills rows exactly when the count divides evenly", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("leaves a short last row", () => {
    expect(chunk([1, 2, 3, 4, 5], 3)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it("puts each item on its own row for one column", () => {
    expect(chunk(["a", "b"], 1)).toEqual([["a"], ["b"]]);
  });

  it("treats a non-positive column count as one", () => {
    expect(chunk(["a", "b"], 0)).toEqual([["a"], ["b"]]);
  });

  it("does not mutate its input", () => {
    const items = [1, 2, 3];
    chunk(items, 2);
    expect(items).toEqual([1, 2, 3]);
  });
});

describe("detailIsSplit", () => {
  it("splits at the threshold and above", () => {
    expect(detailIsSplit(DETAIL_SPLIT_MIN_WIDTH, 1)).toBe(true);
    expect(detailIsSplit(1024, 1)).toBe(true);
  });

  it("stays single-column below it", () => {
    expect(detailIsSplit(DETAIL_SPLIT_MIN_WIDTH - 1, 1)).toBe(false);
    expect(detailIsSplit(440, 1)).toBe(false);
  });

  it("needs more width at larger text sizes", () => {
    expect(detailIsSplit(800, 1)).toBe(true);
    expect(detailIsSplit(800, 1.35)).toBe(false);
  });

  it("caps the text scale so the largest sizes can still split on a big iPad", () => {
    expect(detailIsSplit(1376, 3)).toBe(true);
  });

  it("does not split an unusable width", () => {
    expect(detailIsSplit(Number.NaN, 1)).toBe(false);
  });
});

describe("prefersSheet", () => {
  it("presents as a sheet at the threshold and above", () => {
    expect(prefersSheet(SHEET_MIN_WIDTH)).toBe(true);
    expect(prefersSheet(1376)).toBe(true);
  });

  it("stays full screen on a phone or a narrow Split View", () => {
    expect(prefersSheet(440)).toBe(false);
    expect(prefersSheet(SHEET_MIN_WIDTH - 1)).toBe(false);
  });

  it("stays full screen for an unusable width", () => {
    expect(prefersSheet(Number.NaN)).toBe(false);
  });
});
