import type { Cache } from "@repo/cache";
import type { Database } from "@repo/db";

import type { AuthProvider } from "./middleware/auth.js";
import type { RateLimits } from "./rate-limits.js";

export type Db = Database["db"];

export const PROBE_PATHS: ReadonlySet<string> = new Set(["/healthz", "/readyz"]);

/**
 * One list for both the "write" rate-limit scope and `ensureUserMiddleware`, so
 * a new mutating route cannot reach one and escape the other.
 */
export const MUTATING_METHODS = ["PUT", "POST", "PATCH", "DELETE"] as const;

export interface AppVariables {
  userId: string;
}

export interface AppEnv {
  Variables: AppVariables;
}

export interface AppDeps {
  db: Db;
  cache: Cache;
  auth: AuthProvider;
  production?: boolean;
  rateLimits?: Partial<RateLimits>;
}
