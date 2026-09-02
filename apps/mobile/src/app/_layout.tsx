import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useColorScheme, View } from "react-native";

import { ApiProvider } from "@/api/provider";
import { AuthGate } from "@/auth/auth-gate";
import { CLERK_PUBLISHABLE_KEY } from "@/env";
import { OnboardingGate } from "@/onboarding/onboarding-gate";
import { PurchasesProvider } from "@/purchases/provider";
import { createQueryClient } from "@/query-client";
import { Screen } from "@/theme";

export default function RootLayout() {
  const colorScheme = useColorScheme();
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
                        presented as a full-screen modal over it. Under `Slot` it
                        would replace the tab controller outright — the tabs
                        would unmount and their stacks would be lost, so there
                        would be nothing to return to. */}
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="shared" options={{ presentation: "fullScreenModal" }} />
                    </Stack>
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
