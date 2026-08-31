import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

void SplashScreen.preventAutoHideAsync();

export function useReleaseSplash(ready: boolean): void {
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
}
