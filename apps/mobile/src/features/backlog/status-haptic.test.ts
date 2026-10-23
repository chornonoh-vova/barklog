import { shouldPlayStatusHaptic } from "@/features/backlog/status-haptic";

describe("shouldPlayStatusHaptic", () => {
  it("plays when a game is added to the backlog", () => {
    expect(shouldPlayStatusHaptic(null, "waiting")).toBe(true);
  });

  it("plays when a game moves to another status", () => {
    expect(shouldPlayStatusHaptic("playing", "completed")).toBe(true);
  });

  it("stays quiet for a rating-only change (status unchanged)", () => {
    expect(shouldPlayStatusHaptic("playing", "playing")).toBe(false);
  });

  it("plays when the previous status is unknown — the user deliberately picked one", () => {
    expect(shouldPlayStatusHaptic(undefined, "abandoned")).toBe(true);
  });
});
