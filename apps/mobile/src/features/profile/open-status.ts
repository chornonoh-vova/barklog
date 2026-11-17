import type { BacklogStatus } from "@repo/contracts";
import { useNavigationContainerRef, useRouter } from "expo-router";
import { useCallback } from "react";

type NavState = { routes: readonly { name: string; state?: NavState }[] };

/** Home's own stack, found by name anywhere under the root. */
function homeStack(state: NavState | undefined): NavState | undefined {
  for (const route of state?.routes ?? []) {
    if (route.name === "(home)") return route.state;

    const nested = homeStack(route.state);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** Whether something, like a game, is open over Home's list. */
export function homeHasPushedScreens(root: NavState | undefined): boolean {
  return (homeStack(root)?.routes.length ?? 0) > 1;
}

/**
 * Opens Home filtered to a status. Home's filter lives in `?status=`, but
 * navigating there straight away would push a second Home over a game left
 * open in that tab, so a pushed screen is popped first. The pop only happens
 * when there is one: with nothing to pop, React Navigation reports the action
 * as unhandled. Router calls are queued and run in order.
 */
export function useOpenStatus(): (status: BacklogStatus) => void {
  const router = useRouter();
  const navigation = useNavigationContainerRef();

  return useCallback(
    (status) => {
      if (homeHasPushedScreens(navigation.getRootState() as NavState | undefined)) {
        router.navigate("/(tabs)/(home)");
        router.dismissAll();
      }
      router.navigate(`/(tabs)/(home)?status=${status}`);
    },
    [navigation, router],
  );
}
