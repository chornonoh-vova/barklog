import AsyncStorage from "@react-native-async-storage/async-storage";

import { markOnboardingSeen, readHasSeenOnboarding } from "@/features/onboarding/storage";

describe("readHasSeenOnboarding", () => {
  it("is false on a fresh install, where AsyncStorage has no value yet", () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);

    return expect(readHasSeenOnboarding()).resolves.toBe(false);
  });

  it("is true for any non-null stored value, not only the exact written string", () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce("anything");

    return expect(readHasSeenOnboarding()).resolves.toBe(true);
  });

  it("is true when the read throws, the deliberately counterintuitive default", () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("boom"));

    return expect(readHasSeenOnboarding()).resolves.toBe(true);
  });
});

describe("markOnboardingSeen", () => {
  it("resolves even when the write throws, rather than rejecting", () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("boom"));

    return expect(markOnboardingSeen()).resolves.toBeUndefined();
  });
});
