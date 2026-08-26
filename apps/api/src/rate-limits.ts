export type RateLimitScope = "search" | "write" | "overall";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export type RateLimits = Record<RateLimitScope, RateLimitRule>;

/** Spec §13. Keyed on the Clerk `sub`, so the limits are per person. */
export const DEFAULT_RATE_LIMITS: RateLimits = {
  search: { limit: 30, windowSeconds: 60 },
  write: { limit: 60, windowSeconds: 60 },
  overall: { limit: 300, windowSeconds: 60 },
};

/**
 * Longer than any window, so a counter always outlives the window it counts and
 * the key still expires on its own.
 */
export const RATE_LIMIT_KEY_TTL_SECONDS = 120;
