import AsyncStorage from "@react-native-async-storage/async-storage";

import { persistentFlag } from "@/lib/storage/flag";

const flag = persistentFlag("test.key");

describe("read", () => {
  it("is false where nothing has been written yet", () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);

    return expect(flag.read()).resolves.toBe(false);
  });

  it("is true for any stored value, not only the exact written string", () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce("anything");

    return expect(flag.read()).resolves.toBe(true);
  });

  it("is true when the read throws, the deliberately counterintuitive default", () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("boom"));

    return expect(flag.read()).resolves.toBe(true);
  });
});

describe("mark", () => {
  it("writes under the key it was built with", async () => {
    jest.mocked(AsyncStorage.setItem).mockResolvedValueOnce(undefined);

    await flag.mark();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith("test.key", "1");
  });

  it("resolves even when the write throws, rather than rejecting", () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("boom"));

    return expect(flag.mark()).resolves.toBeUndefined();
  });
});
