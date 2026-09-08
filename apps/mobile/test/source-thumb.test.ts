import type { ShareSourceWire } from "@repo/contracts";
import { expect, test } from "vitest";

import { sourceThumbSize } from "@/features/share/source-thumb";

const SOURCE: ShareSourceWire = {
  provider: "YouTube",
  shareId: "abc",
  title: "A video",
  author: null,
  pageUrl: "https://www.youtube.com/watch?v=a",
  thumbnailUrl: "https://i.ytimg.com/vi/a/hqdefault.jpg",
  thumbnailWidth: null,
  thumbnailHeight: null,
};

test("defaults to 16:9 when no dimensions were reported", () => {
  expect(sourceThumbSize(SOURCE)).toEqual({ height: 56, aspectRatio: 16 / 9 });
});

test("uses the reported ratio when both dimensions are present", () => {
  expect(sourceThumbSize({ ...SOURCE, thumbnailWidth: 480, thumbnailHeight: 360 })).toEqual({
    height: 56,
    aspectRatio: 480 / 360,
  });
});

test("clamps a freak ratio so it cannot distort the row", () => {
  expect(
    sourceThumbSize({ ...SOURCE, thumbnailWidth: 4000, thumbnailHeight: 100 }).aspectRatio,
  ).toBe(1.8);

  expect(
    sourceThumbSize({ ...SOURCE, thumbnailWidth: 100, thumbnailHeight: 4000 }).aspectRatio,
  ).toBe(0.5);
});

test("ignores a partial or nonsensical pair", () => {
  expect(sourceThumbSize({ ...SOURCE, thumbnailWidth: 480 }).aspectRatio).toBe(16 / 9);
  expect(sourceThumbSize({ ...SOURCE, thumbnailWidth: 0, thumbnailHeight: 0 }).aspectRatio).toBe(
    16 / 9,
  );
});
