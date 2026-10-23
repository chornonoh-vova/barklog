// First, so every module below renders with copy from the first frame.
import "@/lib/i18n";
import "@/lib/observe";

import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClientProvider } from "@tanstack/react-query";
import { ObserveRoot } from "expo-observe";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useColorScheme, useWindowDimensions, View } from "react-native";

import { ApiProvider } from "@/lib/api/provider";
import { AuthGate } from "@/lib/auth/auth-gate";
import { CLERK_PUBLISHABLE_KEY } from "@/lib/env";
import { OnboardingGate } from "@/features/onboarding/onboarding-gate";
import { PurchasesProvider } from "@/lib/purchases/provider";
import { createQueryClient } from "@/lib/query/query-client";
import { Screen } from "@/ui/theme";
import { prefersSheet } from "@/ui/columns";
import { WidgetSync } from "@/features/widgets/widget-sync";

function RootLayout() {
  const colorScheme = useColorScheme();
  // Read at presentation time. An open sheet keeps its style if the window
  // later resizes; UIKit already turns a page sheet full screen in compact width.
  const { width } = useWindowDimensions();
  const modal = prefersSheet(width) ? "pageSheet" : "fullScreenModal";
  // useState, not module scope: a client made at import time would outlive the
  // tree across Fast Refresh reloads.
  const [queryClient] = useState(createQueryClient);

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <PurchasesProvider>
            <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
              {/* Fills the otherwise-unpainted white root view for the frames
                  either gate renders `null` after the splash is down —
                  `OnboardingGate` mid storage-read, `AuthGate` before Clerk's
                  `isLoaded` lands. */}
              <View style={Screen.fill}>
                <OnboardingGate>
                  <AuthGate>
                    {/* `Stack`, not `Slot`: `/shared` is a sibling of `(tabs)`,
                        presented as a modal over it — a page sheet on a wide
                        window, full screen otherwise. Under `Slot` it
                        would replace the tab controller outright — the tabs
                        would unmount and their stacks would be lost, so there
                        would be nothing to return to. */}
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="shared" options={{ presentation: modal }} />
                      <Stack.Screen name="paywall" options={{ presentation: modal }} />
                    </Stack>
                    <WidgetSync />
                  </AuthGate>
                </OnboardingGate>
              </View>
              <StatusBar style="auto" />
            </ThemeProvider>
          </PurchasesProvider>
        </ApiProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

// Measures Time to First Render; Time to Interactive is marked in `@/splash`.
export default ObserveRoot.wrap(RootLayout);
