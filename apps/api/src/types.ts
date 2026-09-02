import type { Cache } from "@repo/cache";
import type { Database, SubscriptionRow } from "@repo/db";

import type { AuthProvider } from "./middleware/auth.js";
import type { RateLimits } from "./rate-limits.js";
import type { Canonical, VideoRef } from "./share/canonicalise.js";
import type { VideoMeta } from "./share/oembed.js";

export type Db = Database["db"];

export const PROBE_PATHS: ReadonlySet<string> = new Set(["/healthz", "/readyz"]);

/**
 * Separate from `PROBE_PATHS`, not merged into it: that set also drives the
 * `honoLogger` skip, and webhook requests should be logged.
 */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([...PROBE_PATHS, "/webhooks/revenuecat"]);

/** Scoped, not global: nobody should POST a megabyte at a backlog write. */
export const WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;

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

/**
 * The three impure edges of the identify pipeline, injected so the test suite
 * needs no network — the same reason `auth: AuthProvider` is a dep.
 * `parseShareUrl` is deliberately absent: it is pure, so tests exercise the
 * real one.
 */
export interface ShareProvider {
  /** The model that produced a cached extraction — the route needs it to build the cache key. */
  model: string;
  resolveShortLink(url: string): Promise<Canonical>;
  fetchMeta(ref: VideoRef): Promise<VideoMeta>;
  extractTitles(meta: VideoMeta): Promise<string[]>;
}

/** Injected like `share`, so the suite needs no network. */
export interface RevenueCatClient {
  fetchSubscriber(appUserId: string): Promise<SubscriptionRow | null>;
}

export interface AppDeps {
  db: Db;
  cache: Cache;
  auth: AuthProvider;
  share: ShareProvider;
  revenueCat: RevenueCatClient;
  webhookSecret: string;
  webhookSigningSecret: string;
  production?: boolean;
  rateLimits?: Partial<RateLimits>;
}
