import type { BacklogStatus } from "@repo/contracts";
import { useNavigationContainerRef, useRouter } from "expo-router";
import { useCallback } from "react";

type NavState = { routes: readonly { name: string; state?: NavState }[] };

function homeStack(state: NavState | undefined): NavState | undefined {
  for (const route of state?.routes ?? []) {
    if (route.name === "(home)") return route.state;

    const nested = homeStack(route.state);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

export function homeHasPushedScreens(root: NavState | undefined): boolean {
  return (homeStack(root)?.routes.length ?? 0) > 1;
}

/**
 * Pops a screen left open over Home first, or navigating would push a second Home.
 * Pop only when there is one: React Navigation reports an empty pop as unhandled.
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
