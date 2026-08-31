import { useAuth } from "@clerk/expo";
import { AuthView, useAuthViewState } from "@clerk/expo/native";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";

import { useReleaseSplash } from "@/splash";

import { shouldClearCache } from "./should-clear-cache";

/**
 * Two hooks, deliberately: `isSignedIn` flips true before a native
 * biometric-enrollment prompt finishes, so rendering off it would unmount
 * `AuthView` mid-prompt. `treatPendingAsSignedOut: false` stops a session
 * mid-establishment from reading as signed-out and clearing the cache.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isAuthFlowComplete } = useAuthViewState();
  const { userId } = useAuth({ treatPendingAsSignedOut: false });
  const queryClient = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;

    if (shouldClearCache(previous.current, userId)) queryClient.clear();
    if (userId !== undefined) previous.current = userId;
  }, [isLoaded, userId, queryClient]);

  useReleaseSplash(isLoaded);

  if (!isLoaded) return null;

  if (!isAuthFlowComplete) return <AuthView isDismissible={false} />;

  return children;
}
