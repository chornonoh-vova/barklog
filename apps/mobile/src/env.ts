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
