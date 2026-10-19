import { Observe } from "expo-observe";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

void SplashScreen.preventAutoHideAsync();

/**
 * Releasing the splash is also the app's Time to Interactive: it is the one
 * point every entry path (onboarding, sign-in, the tabs) passes through, and
 * Observe keeps only the first mark of a session. The raw `Observe` call, not
 * `useObserve()`: both gates sit in the root layout, outside any screen, where
 * the router integration has no screen to attribute the mark to.
 */
export function useReleaseSplash(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync();
    Observe.markInteractive();
  }, [ready]);
}
