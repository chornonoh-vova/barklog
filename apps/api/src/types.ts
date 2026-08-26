import type { Cache } from "@repo/cache";
import type { Database } from "@repo/db";

import type { AuthProvider } from "./middleware/auth.js";
import type { RateLimits } from "./rate-limits.js";

export type Db = Database["db"];

/** The two public routes, allowlisted by exact path — never by prefix. */
export const PROBE_PATHS: ReadonlySet<string> = new Set(["/healthz", "/readyz"]);

/**
 * The HTTP methods that mutate state. Spec §8 makes `PUT` the only write verb
 * today — no `POST`, no `PATCH` — but `app.ts` uses this single list for both
 * the "write" rate-limit scope and `ensureUserMiddleware`. Sharing it is what
 * keeps the limiter and the provisioner from disagreeing if a new mutating
 * route ever appears: without it, a route added to one list and not the
 * other would silently escape the 60/min write limit while still being
 * counted by the much looser 300/min "overall" scope.
 */
export const MUTATING_METHODS = ["PUT", "POST", "PATCH", "DELETE"] as const;

export interface AppVariables {
  /** The Clerk `sub`, set by `requireAuth`. Absent only on the public probes. */
  userId: string;
}

export interface AppEnv {
  Variables: AppVariables;
}

/**
 * Everything the app needs, passed in rather than imported, so a test can
 * substitute a dead cache or a fake authenticator without touching a module
 * registry. Logging is absent on purpose: LogTape is configured once per process
 * and reached with `getLogger()`, so there is nothing to inject.
 */
export interface AppDeps {
  db: Db;
  cache: Cache;
  auth: AuthProvider;
  /** Gates HSTS. Defaults to false. */
  production?: boolean;
  /** Merged over `DEFAULT_RATE_LIMITS`. Tests use it to shrink a window. */
  rateLimits?: Partial<RateLimits>;
}
