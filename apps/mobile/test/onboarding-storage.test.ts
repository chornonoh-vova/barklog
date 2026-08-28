import { describe, expect, it, vi } from "vitest";

// Factory form, not `vi.mock(path)` alone: the real module transitively
// requires react-native, which `vitest.config.mts` runs with no RN transform.
// The factory replaces the module before anything imports it, so the real
// implementation — and react-native — is never loaded.
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
const { markOnboardingSeen, readHasSeenOnboarding } = await import("@/onboarding/storage");

describe("readHasSeenOnboarding", () => {
  it("is false on a fresh install, where AsyncStorage has no value yet", () => {
    // Prevents: treating a fresh install as already onboarded, which would
    // skip the pages for every first-time user.
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);

    return expect(readHasSeenOnboarding()).resolves.toBe(false);
  });

  it("is true for any non-null stored value, not only the exact written string", () => {
    // Prevents: a future rewrite that compares against `=== "1"` instead of
    // `!== null`, which would silently start re-showing onboarding to anyone
    // whose stored value ever changes shape.
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce("anything");

    return expect(readHasSeenOnboarding()).resolves.toBe(true);
  });

  it("is true when the read throws, the deliberately counterintuitive default", () => {
    // Prevents: a broken AsyncStorage read trapping the user behind onboarding
    // on every launch instead of just letting them through once more than
    // strictly necessary.
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("boom"));

    return expect(readHasSeenOnboarding()).resolves.toBe(true);
  });
});

describe("markOnboardingSeen", () => {
  it("resolves even when the write throws, rather than rejecting", () => {
    // Prevents: removing the try/catch around `setItem`. `onboarding-gate.tsx`
    // calls this fire-and-forget and chains `setHasSeen(true)` off it — a
    // rejection here would silently stop that local-state update from ever
    // running, and the gate's own comment asserts this can't happen.
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("boom"));

    return expect(markOnboardingSeen()).resolves.toBeUndefined();
  });
});
