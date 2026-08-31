import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useColorScheme, View } from "react-native";

import { ApiProvider } from "@/api/provider";
import { AuthGate } from "@/auth/auth-gate";
import { CLERK_PUBLISHABLE_KEY } from "@/env";
import { OnboardingGate } from "@/onboarding/onboarding-gate";
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
          <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            {/* Fills the otherwise-unpainted white root view for the frames
                either gate renders `null` after the splash is down —
                `OnboardingGate` mid storage-read, `AuthGate` before Clerk's
                `isLoaded` lands. */}
            <View style={Screen.fill}>
              <OnboardingGate>
                <AuthGate>
                  {/* `Slot`, not `Stack`: (tabs) is the only root route, so a Stack
                      would wrap the tab controller in a UINavigationController for
                      nothing. */}
                  <Slot />
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
