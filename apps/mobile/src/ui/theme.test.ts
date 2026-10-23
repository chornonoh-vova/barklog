import { Brand, COVER_ASPECT, Screen, SHOT_ASPECT } from "@/ui/theme";

describe("theme", () => {
  it("keeps covers 3:4 portrait and screenshots 16:9, width over height", () => {
    expect(100 / COVER_ASPECT).toBeCloseTo(133.33, 2);
    expect(160 / SHOT_ASPECT).toBe(90);
  });

  it("lets a list's content grow, so an empty state gets the height to show in", () => {
    expect(Screen.listContent).toEqual({ flexGrow: 1 });
  });

  it("has a single hex brand tint", () => {
    expect(Brand.tint).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
