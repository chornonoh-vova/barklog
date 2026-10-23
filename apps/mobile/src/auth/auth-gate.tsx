import { useAuth } from "@clerk/expo";
import { AuthView, useAuthViewState } from "@clerk/expo/native-components";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";

import { clearRecents } from "@/features/search/recents-storage";
import { clearPersistedCaches, startPersistence } from "@/query-persist";
import { useReleaseSplash } from "@/splash";
import { clearWidget } from "@/widgets/sync";

import { shouldClearCache, shouldClearDeviceData } from "./should-clear-cache";

/**
 * Two hooks, deliberately: `isSignedIn` flips true before a native
 * biometric-enrollment prompt finishes, so rendering off it would unmount
 * `AuthView` mid-prompt. `treatPendingAsSignedOut: false` stops a session
 * mid-establishment from reading as signed-out and clearing the cache.
 */
/** Recents, the saved query cache and the widget live on disk but are
 * personal: the next account must not see them. Independent of each other. */
function clearDeviceData(userId: string | null): void {
  clearRecents();
  void clearPersistedCaches(userId);
  clearWidget();
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isAuthFlowComplete } = useAuthViewState();
  const { userId } = useAuth({ treatPendingAsSignedOut: false });
  const queryClient = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;

    if (shouldClearDeviceData(previous.current, userId)) clearDeviceData(userId ?? null);
    if (shouldClearCache(previous.current, userId)) queryClient.clear();
    if (userId !== undefined) previous.current = userId;
  }, [isLoaded, userId, queryClient]);

  useEffect(() => {
    if (!isLoaded || typeof userId !== "string") return;

    return startPersistence(queryClient, userId);
  }, [isLoaded, userId, queryClient]);

  useReleaseSplash(isLoaded);

  if (!isLoaded) return null;

  if (!isAuthFlowComplete) return <AuthView isDismissible={false} />;

  return children;
}
