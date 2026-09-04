import { describe, expect, it, vi } from "vitest";

// Factory form, as in onboarding-storage.test.ts: the real module pulls in
// react-native, which the Vitest config runs with no transform for.
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
const { markAskedForReview, readHasAskedForReview } = await import("@/review/storage");

describe("readHasAskedForReview", () => {
  it("is false on a fresh install, where nothing has been written yet", () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);

    return expect(readHasAskedForReview()).resolves.toBe(false);
  });

  it("is true for any stored value, not only the exact written string", () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce("anything");

    return expect(readHasAskedForReview()).resolves.toBe(true);
  });

  it("is true when the read throws, spending no prompt on a storage error", () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("boom"));

    return expect(readHasAskedForReview()).resolves.toBe(true);
  });
});

describe("markAskedForReview", () => {
  it("resolves even when the write throws, rather than rejecting", () => {
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("boom"));

    return expect(markAskedForReview()).resolves.toBeUndefined();
  });
});
