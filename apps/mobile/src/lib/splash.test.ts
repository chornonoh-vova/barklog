import { renderHook } from "@testing-library/react-native";
import { Observe } from "expo-observe";
import * as SplashScreen from "expo-splash-screen";

import { useReleaseSplash } from "@/lib/splash";

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
}));

describe("splash", () => {
  it("keeps the splash up from import", () => {
    jest.isolateModules(() => {
      jest.requireActual("@/lib/splash");
    });

    expect(jest.mocked(SplashScreen.preventAutoHideAsync)).toHaveBeenCalledTimes(1);
  });
});

describe("useReleaseSplash", () => {
  it("leaves the splash up while not ready", async () => {
    await renderHook(() => useReleaseSplash(false));

    expect(jest.mocked(SplashScreen.hideAsync)).not.toHaveBeenCalled();
    expect(Observe.markInteractive).not.toHaveBeenCalled();
  });

  it("hides the splash and marks Time to Interactive once ready", async () => {
    const { rerender } = await renderHook(
      ({ ready }: { ready: boolean }) => useReleaseSplash(ready),
      {
        initialProps: { ready: false },
      },
    );

    await rerender({ ready: true });

    expect(jest.mocked(SplashScreen.hideAsync)).toHaveBeenCalledTimes(1);
    expect(Observe.markInteractive).toHaveBeenCalledTimes(1);
  });

  it("does not release again on a re-render that stays ready", async () => {
    const { rerender } = await renderHook(
      ({ ready }: { ready: boolean }) => useReleaseSplash(ready),
      {
        initialProps: { ready: true },
      },
    );

    await rerender({ ready: true });

    expect(jest.mocked(SplashScreen.hideAsync)).toHaveBeenCalledTimes(1);
  });
});
