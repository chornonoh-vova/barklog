import { isAccessibilitySize } from "@/ui/text-size";

describe("isAccessibilitySize", () => {
  it.each([
    [1, false],
    [1.353, false], // xxxLarge, the largest standard size
    [1.6, true],
    [1.647, true], // AX1
    [3.12, true], // AX5
  ])("fontScale %s → %s", (scale, expected) => {
    expect(isAccessibilitySize(scale)).toBe(expected);
  });

  it("is false for an unusable scale", () => {
    expect(isAccessibilitySize(Number.NaN)).toBe(false);
  });
});
