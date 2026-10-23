import { describe, expect, it } from "vitest";

import { screenshotLabel } from "@/features/game/screenshot-label";

describe("screenshotLabel", () => {
  it("counts from one, so VoiceOver reads a human position", () => {
    expect(screenshotLabel(0, 12)).toBe("Screenshot 1 of 12");
  });

  it("labels the last shot", () => {
    expect(screenshotLabel(11, 12)).toBe("Screenshot 12 of 12");
  });
});
