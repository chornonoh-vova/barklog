import { clerkMiddleware, getAuth } from "@clerk/hono";

import type { AuthProvider } from "./middleware/auth.js";

/**
 * `getAuth` throws if `clerkMiddleware` has not run, so `createApp` installs
 * both together on `*`.
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
