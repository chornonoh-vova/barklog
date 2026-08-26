import type { Cache } from "@repo/cache";
import type { Database } from "@repo/db";

import type { AuthProvider } from "./middleware/auth.js";

export type Db = Database["db"];

/** The two public routes, allowlisted by exact path — never by prefix. */
export const PROBE_PATHS: ReadonlySet<string> = new Set(["/healthz", "/readyz"]);

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
}
