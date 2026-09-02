export type RateLimitScope = "search" | "identify" | "write" | "refresh" | "overall";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export type RateLimits = Record<RateLimitScope, RateLimitRule>;

export const DEFAULT_RATE_LIMITS: RateLimits = {
  search: { limit: 30, windowSeconds: 60 },
  // Tighter than `search`: one call costs an outbound HTTP round trip and an
  // LLM call, so it is the only route where a burst has a per-request cost.
  identify: { limit: 10, windowSeconds: 60 },
  write: { limit: 60, windowSeconds: 60 },
  // Reaches a third party, and only a purchase or restore needs it.
  refresh: { limit: 10, windowSeconds: 60 },
  overall: { limit: 300, windowSeconds: 60 },
};
