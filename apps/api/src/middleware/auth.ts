import { ensureUser } from "@repo/db";
import type { Context, MiddlewareHandler } from "hono";

import { problems } from "../problems.js";
import { PROBE_PATHS, type AppEnv, type Db } from "../types.js";

/**
 * Verification behind a function type. The production implementation lives in
 * `src/clerk.ts`; a test substitutes a fake, which is the only reason the
 * authenticated suite needs no network access to Clerk (spec §13).
 */
export type Authenticator = (c: Context) => Promise<string | null> | string | null;

export interface AuthProvider {
  /** Runs before `requireAuth`. Absent in tests, `clerkMiddleware()` in production. */
  middleware?: MiddlewareHandler;
  authenticate: Authenticator;
}

export function requireAuth(authenticate: Authenticator): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // By exact path, not by prefix — a prefix allowlist would quietly make a
    // future `/healthz-debug` public. The same set decides what the request
    // logger skips, which is why it lives in `types.ts` and not here.
    if (PROBE_PATHS.has(c.req.path)) return next();

    const userId = await authenticate(c);
    if (!userId) {
      throw problems.create("UNAUTHORIZED", {
        detail: "A valid session token is required.",
      });
    }

    c.set("userId", userId);
    await next();
  };
}

/**
 * Just-in-time provisioning on mutating requests only (spec §4). A read never
 * needs the row to exist: the only thing keyed on it is a backlog entry, and
 * creating one is a mutation by definition.
 */
export function ensureUserMiddleware(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await ensureUser(db, c.get("userId"));
    await next();
  };
}
