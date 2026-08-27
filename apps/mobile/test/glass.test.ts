import { describe, expect, it } from "vitest";

import { glassButtonStyle } from "@/ui/glass";

describe("glassButtonStyle", () => {
  it("uses Liquid Glass on iOS 26", () => {
    expect(glassButtonStyle(26, false)).toBe("glass");
    expect(glassButtonStyle(26, true)).toBe("glassProminent");
  });

  it("uses Liquid Glass on iOS above 26", () => {
    expect(glassButtonStyle(27, true)).toBe("glassProminent");
  });

  it("falls back to bordered styles below iOS 26", () => {
    expect(glassButtonStyle(18, false)).toBe("bordered");
    expect(glassButtonStyle(18, true)).toBe("borderedProminent");
  });

  it("falls back rather than throwing when the version cannot be parsed", () => {
    expect(glassButtonStyle(Number.NaN, true)).toBe("borderedProminent");
  });
});
