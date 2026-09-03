import { describe, expect, it } from "vitest";

import { sourceThumbSize } from "@/features/share/source-thumb";

describe("sourceThumbSize", () => {
  it("gives both providers the same height, so the row never changes height", () => {
    expect(sourceThumbSize("youtube").height).toBe(sourceThumbSize("tiktok").height);
  });

  it("renders YouTube landscape", () => {
    const { width, height } = sourceThumbSize("youtube");

    expect(width).toBeGreaterThan(height);
  });

  it("renders TikTok portrait", () => {
    const { width, height } = sourceThumbSize("tiktok");

    expect(height).toBeGreaterThan(width);
  });

  it("pins the exact dimensions, so a change in the rounding is visible", () => {
    expect(sourceThumbSize("youtube")).toEqual({ width: 100, height: 56 });
    expect(sourceThumbSize("tiktok")).toEqual({ width: 32, height: 56 });
  });
});
