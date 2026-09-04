import { describe, expect, it, vi } from "vitest";

// Factory form, as in onboarding-storage.test.ts: the real module pulls in
// react-native, which the Vitest config runs with no transform for.
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
const { persistentFlag } = await import("@/storage/flag");

const flag = persistentFlag("test.key");

describe("read", () => {
  it("is false where nothing has been written yet", () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);

    return expect(flag.read()).resolves.toBe(false);
  });

  it("is true for any stored value, not only the exact written string", () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce("anything");

    return expect(flag.read()).resolves.toBe(true);
  });

  it("is true when the read throws, the deliberately counterintuitive default", () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("boom"));

    return expect(flag.read()).resolves.toBe(true);
  });
});

describe("mark", () => {
  it("writes under the key it was built with", async () => {
    vi.mocked(AsyncStorage.setItem).mockResolvedValueOnce(undefined);

    await flag.mark();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith("test.key", "1");
  });

  it("resolves even when the write throws, rather than rejecting", () => {
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("boom"));

    return expect(flag.mark()).resolves.toBeUndefined();
  });
});
