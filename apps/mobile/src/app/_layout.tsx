import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useColorScheme } from "react-native";

import { ApiProvider } from "@/api/provider";
import { AuthGate } from "@/auth/auth-gate";
import { CLERK_PUBLISHABLE_KEY } from "@/env";
import { OnboardingGate } from "@/onboarding/onboarding-gate";
import { createQueryClient } from "@/query-client";

/**
 * Here rather than in a gate: either gate below may be the first to paint, and
 * each hides the splash itself once it does. This file is the entry point, so it
 * is the one place guaranteed to run before that decision is made.
 */
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // useState, not module scope: a client created at import time would be shared
  // across Fast Refresh reloads and outlive the tree it belongs to.
  const [queryClient] = useState(createQueryClient);

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            <OnboardingGate>
              <AuthGate>
                {/* `Slot`, not `Stack`: (tabs) is the only root route, so a Stack
                    would wrap the tab controller in a UINavigationController for
                    nothing. */}
                <Slot />
              </AuthGate>
            </OnboardingGate>
            <StatusBar style="auto" />
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
