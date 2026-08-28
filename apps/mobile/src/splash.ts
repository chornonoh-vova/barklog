import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

void SplashScreen.preventAutoHideAsync();

/**
 * The splash is one piece of global native state that two gates can each be the
 * first to paint over. Owning both halves here means a gate declares only its
 * own readiness and never has to know the other exists. `hideAsync` is
 * idempotent, so whichever gate is ready first wins and later calls do nothing.
 */
export function useReleaseSplash(ready: boolean): void {
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
}
