import { useAuth } from "@clerk/expo";
import { AuthView, useAuthViewState } from "@clerk/expo/native";
import { useQueryClient } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, type ReactNode } from "react";

import { shouldClearCache } from "./should-clear-cache";

void SplashScreen.preventAutoHideAsync();

/**
 * The whole API is authenticated — only `/healthz` and `/readyz` are public —
 * so there is no anonymous state worth designing. `isDismissible={false}` is
 * what makes this a guard rather than a modal.
 *
 * **Two hooks, deliberately.**
 *
 * `useAuthViewState()` decides what to RENDER. It is the hook Clerk ships for
 * precisely this shape — its own docstring says "use this hook when
 * biometric-credential enrollment prompts are enabled and a non-dismissible
 * root `AuthView` must remain mounted until the prompt finishes", which is
 * exactly what this component is. `isSignedIn` alone flips true as soon as the
 * session exists, which is *before* a native biometric-enrollment prompt has
 * finished — swapping on it would unmount `AuthView` mid-prompt and cut the
 * enrollment off. Where the native module does not expose auth-flow state the
 * hook falls back to `isLoaded && isSignedIn`, i.e. the naive behaviour, so
 * using it is never worse.
 *
 * `useAuth({ treatPendingAsSignedOut: false })` supplies the sign-out EDGE,
 * which `useAuthViewState` does not expose. The flag stops a session
 * mid-establishment being misread as signed-out.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isAuthFlowComplete } = useAuthViewState();
  const { isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const queryClient = useQueryClient();
  const previous = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;

    if (shouldClearCache(previous.current, isSignedIn)) queryClient.clear();
    previous.current = isSignedIn;
  }, [isLoaded, isSignedIn, queryClient]);

  useEffect(() => {
    // Held open until Clerk has read the keychain, so a returning user never
    // sees a flash of the sign-in screen.
    if (isLoaded) void SplashScreen.hideAsync();
  }, [isLoaded]);

  if (!isLoaded) return null;

  if (!isAuthFlowComplete) return <AuthView isDismissible={false} />;

  return children;
}
