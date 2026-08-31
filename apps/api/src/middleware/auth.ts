import { ensureUser } from "@repo/db";
import type { Context, MiddlewareHandler } from "hono";

import { problems } from "../problems.js";
import { PROBE_PATHS, type AppEnv, type Db } from "../types.js";

export type Authenticator = (c: Context) => Promise<string | null> | string | null;

export interface AuthProvider {
  middleware?: MiddlewareHandler;
  authenticate: Authenticator;
}

export function requireAuth(authenticate: Authenticator): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // By exact path: a prefix allowlist would quietly make a future
    // `/healthz-debug` public.
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

export function ensureUserMiddleware(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await ensureUser(db, c.get("userId"));
    await next();
  };
}
