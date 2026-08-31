import { describe, expect, it, vi } from "vitest";

// Factory form, not `vi.mock(path)` alone: the real module pulls in
// react-native, which the Vitest config runs with no transform for.
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
const { markOnboardingSeen, readHasSeenOnboarding } = await import("@/onboarding/storage");

describe("readHasSeenOnboarding", () => {
  it("is false on a fresh install, where AsyncStorage has no value yet", () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);

    return expect(readHasSeenOnboarding()).resolves.toBe(false);
  });

  it("is true for any non-null stored value, not only the exact written string", () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce("anything");

    return expect(readHasSeenOnboarding()).resolves.toBe(true);
  });

  it("is true when the read throws, the deliberately counterintuitive default", () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("boom"));

    return expect(readHasSeenOnboarding()).resolves.toBe(true);
  });
});

describe("markOnboardingSeen", () => {
  it("resolves even when the write throws, rather than rejecting", () => {
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("boom"));

    return expect(markOnboardingSeen()).resolves.toBeUndefined();
  });
});
