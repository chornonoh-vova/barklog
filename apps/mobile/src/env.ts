/**
 * A function rather than an inline `if (!x) throw`, because TypeScript does not
 * carry that narrowing into the component closures that read these values.
 *
 * The `process.env.EXPO_PUBLIC_*` reads stay inline and literal: Expo's Babel
 * transform substitutes them statically and cannot follow a dynamic lookup.
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
