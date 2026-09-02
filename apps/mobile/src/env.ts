/**
 * The `process.env.EXPO_PUBLIC_*` reads must stay inline and literal: Expo's
 * Babel transform substitutes them statically and cannot follow a dynamic lookup.
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Add it to apps/mobile/.env — see .env.example.`);
  }

  return value;
}

export const API_URL = requireEnv("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL);

export const CLERK_PUBLISHABLE_KEY = requireEnv(
  "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
);

/**
 * RevenueCat warns in capitals never to submit an app configured with a Test
 * Store key, so the choice is made here rather than left to a `.env` someone
 * has to remember. Expo folds both `__DEV__` and the `process.env` reads at
 * build time, so a release bundle contains neither the branch nor the test key.
 */
export const REVENUECAT_API_KEY = __DEV__
  ? requireEnv("EXPO_PUBLIC_REVENUECAT_TEST_KEY", process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY)
  : requireEnv("EXPO_PUBLIC_REVENUECAT_IOS_KEY", process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY);
