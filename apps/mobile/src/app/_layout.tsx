import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useColorScheme } from "react-native";

import { ApiProvider } from "@/api/provider";
import { AuthGate } from "@/auth/auth-gate";
import { CLERK_PUBLISHABLE_KEY } from "@/env";
import { createQueryClient } from "@/query-client";

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
            <AuthGate>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
              </Stack>
            </AuthGate>
            <StatusBar style="auto" />
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
