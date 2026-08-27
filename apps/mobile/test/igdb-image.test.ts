import { describe, expect, it } from "vitest";

import { coverUrl, screenshotUrl } from "@/igdb-image";

describe("coverUrl", () => {
  it("builds a small cover URL for list rows", () => {
    expect(coverUrl("co4jni", "small")).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_small_2x/co4jni.jpg",
    );
  });

  it("builds a big cover URL for the detail hero", () => {
    expect(coverUrl("co4jni", "big")).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co4jni.jpg",
    );
  });

  it("returns null for a game with no cover, so callers render a placeholder", () => {
    expect(coverUrl(null, "small")).toBeNull();
  });
});

describe("screenshotUrl", () => {
  it("builds a medium screenshot URL", () => {
    expect(screenshotUrl("sc8xyz")).toBe(
      "https://images.igdb.com/igdb/image/upload/t_screenshot_med_2x/sc8xyz.jpg",
    );
  });
});
