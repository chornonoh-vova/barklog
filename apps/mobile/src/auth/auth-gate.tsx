import { useAuth } from "@clerk/expo";
import { AuthView, useAuthViewState } from "@clerk/expo/native";
import { useQueryClient } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, type ReactNode } from "react";

import { shouldClearCache } from "./should-clear-cache";

void SplashScreen.preventAutoHideAsync();

/**
 * Two hooks, deliberately. `useAuthViewState()` decides what to render:
 * `isSignedIn` alone flips true as soon as the session exists, which is before a
 * native biometric-enrollment prompt has finished, so swapping on it would
 * unmount `AuthView` mid-prompt and cut the enrollment off.
 * `useAuth({ treatPendingAsSignedOut: false })` supplies the active user id,
 * which `useAuthViewState` does not expose. The flag keeps a session
 * mid-establishment from reading as signed-out and clearing the cache under a
 * user who never left.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isAuthFlowComplete } = useAuthViewState();
  const { userId } = useAuth({ treatPendingAsSignedOut: false });
  const queryClient = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;

    if (shouldClearCache(previous.current, userId)) queryClient.clear();
    // `undefined` means "not yet known", not signed-out. Recording it would
    // erase which user we were on and let the next change past.
    if (userId !== undefined) previous.current = userId;
  }, [isLoaded, userId, queryClient]);

  useEffect(() => {
    // Held open until Clerk has read the keychain, so a returning user never
    // sees the sign-in screen flash.
    if (isLoaded) void SplashScreen.hideAsync();
  }, [isLoaded]);

  if (!isLoaded) return null;

  if (!isAuthFlowComplete) return <AuthView isDismissible={false} />;

  return children;
}
