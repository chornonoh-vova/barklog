/**
 * Mirrors `apps/api/src/env.ts`: a missing variable refuses the app at import
 * time rather than surfacing as a mystery 401 on the first request.
 *
 * This is a *function* rather than an inline `if (!x) throw` at module scope
 * because TypeScript does not carry that narrowing into the component closures
 * that consume these values — `const x = process.env.FOO; if (!x) throw;` still
 * leaves `x` as `string | undefined` when read inside a component, which is a
 * compile error under this repo's strict config.
 *
 * The `process.env.EXPO_PUBLIC_*` reads stay inline and literal: Expo's Babel
 * transform substitutes them statically at build time and cannot follow a
 * dynamic lookup.
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
