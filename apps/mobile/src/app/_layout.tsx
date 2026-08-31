import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState } from "react";
import { useColorScheme, View } from "react-native";

import { ApiProvider } from "@/api/provider";
import { AuthGate } from "@/auth/auth-gate";
import { CLERK_PUBLISHABLE_KEY } from "@/env";
import { ShareSheet } from "@/features/share/share-sheet";
import { useSharedUrl } from "@/features/share/use-shared-url";
import { OnboardingGate } from "@/onboarding/onboarding-gate";
import { createQueryClient } from "@/query-client";
import { Screen } from "@/theme";

/** The route the sheet belongs to. Its own children — `/shared/game/[id]` —
 * deliberately do not match, so pushing one collapses the sheet. */
const SHARE_ROUTE = "/shared";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // useState, not module scope: a client made at import time would outlive the
  // tree across Fast Refresh reloads.
  const [queryClient] = useState(createQueryClient);

  const router = useRouter();
  const pathname = usePathname();
  const { url, isPending, error, clear } = useSharedUrl();

  /**
   * Which url was dismissed, rather than a boolean: `clear()` is a bare native
   * call with no React state behind it, so nothing in the hook's output moves
   * when the sheet closes and a flag would need an effect to reset itself. This
   * compares instead, and the next share re-presents on its own.
   *
   * `undefined` is "nothing dismissed yet" and `null` is a share that resolved
   * without a url — both real values, so they cannot share a sentinel.
   */
  const [dismissedUrl, setDismissedUrl] = useState<string | null | undefined>(undefined);
  const dismissed = dismissedUrl !== undefined && dismissedUrl === url;

  const dismiss = useCallback(() => {
    // Before hiding, or the payload survives in the App Group and the next cold
    // launch re-presents a share the user already dealt with.
    clear();
    setDismissedUrl(url);
  }, [clear, url]);

  const openGame = useCallback((id: number) => router.push(`/shared/game/${id}`), [router]);

  const search = useCallback(() => {
    clear();
    setDismissedUrl(url);
    // `dismissTo`, per the v57 router docs: it dismisses screens until the href
    // is reached, taking the `fullScreenModal` off on the way to Search.
    router.dismissTo("/search");
  }, [clear, router, url]);

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            {/* Fills the otherwise-unpainted white root view for the frames
                either gate renders `null` after the splash is down —
                `OnboardingGate` mid storage-read, `AuthGate` before Clerk's
                `isLoaded` lands. */}
            <View style={Screen.fill}>
              <OnboardingGate>
                <AuthGate>
                  <>
                    {/* `Stack`, not `Slot`: `/shared` is a sibling of `(tabs)`,
                        presented as a full-screen modal over it. Under `Slot` it
                        would replace the tab controller outright — the tabs
                        would unmount and their stacks would be lost, so there
                        would be nothing to return to. */}
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="shared" options={{ presentation: "fullScreenModal" }} />
                    </Stack>

                    {/* Here, not inside `/shared`: the sheet outlives that
                        screen's own navigation, and sitting inside both gates
                        keeps it from ever rendering — or querying — for a
                        signed-out or onboarding user. */}
                    <ShareSheet
                      url={url}
                      isPending={isPending}
                      error={error}
                      isPresented={pathname === SHARE_ROUTE && !dismissed}
                      onSelect={openGame}
                      onDismiss={dismiss}
                      onSearch={search}
                    />
                  </>
                </AuthGate>
              </OnboardingGate>
            </View>
            <StatusBar style="auto" />
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
