import { clerkMiddleware, getAuth } from "@clerk/hono";

import type { AuthProvider } from "./middleware/auth.js";

/**
 * The only file in the API that imports Clerk.
 *
 * Verification is stateless: `clerkMiddleware` checks the session JWT against
 * Clerk's JWKS with a cached key set, so there is no Clerk round trip per
 * request. The keys are passed in from the validated environment rather than
 * read from `process.env` inside the middleware, so a missing key is a boot
 * failure (spec §13).
 *
 * `getAuth` throws if `clerkMiddleware` has not run, so both are installed
 * together on `*` in `createApp`; `userId` is `null` for an anonymous request.
 */
export function clerkAuthProvider(env: {
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
}): AuthProvider {
  return {
    middleware: clerkMiddleware({
      secretKey: env.CLERK_SECRET_KEY,
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
    }),
    authenticate: (c) => getAuth(c).userId,
  };
}
