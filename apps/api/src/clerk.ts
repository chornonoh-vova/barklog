import { verifyWebhook } from "@clerk/backend/webhooks";
import { clerkMiddleware, getAuth } from "@clerk/hono";

import type { AuthProvider } from "./middleware/auth.js";
import type { ClerkWebhookEvent } from "./types.js";

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

/** Throws on a signature that does not verify; the route turns that into a 401. */
export function clerkWebhookVerifier(signingSecret: string) {
  return async (request: Request): Promise<ClerkWebhookEvent> => {
    const event = await verifyWebhook(request, { signingSecret });

    return { type: event.type, data: { id: event.data.id } };
  };
}
