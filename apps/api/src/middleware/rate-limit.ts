import type { Cache } from "@repo/cache";
import type { MiddlewareHandler } from "hono";

import { problems, renderProblem } from "../problems.js";
import {
  RATE_LIMIT_KEY_TTL_SECONDS,
  type RateLimitRule,
  type RateLimitScope,
} from "../rate-limits.js";
import type { AppEnv } from "../types.js";

export function rateLimitKey(scope: RateLimitScope, userId: string, window: number): string {
  return `rl:${scope}:${userId}:${window}`;
}

/**
 * A fixed window, not a sliding one: `INCR` plus `EXPIRE` is atomic and cheap,
 * and the window number is part of the key, so nothing has to be cleaned up.
 */
export function rateLimit(
  cache: Cache,
  scope: RateLimitScope,
  rule: RateLimitRule,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get("userId");
    // Only the public probes reach here without an identity, and they are not
    // limited — a probe that gets a 429 restarts a healthy container.
    if (!userId) return next();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const window = Math.floor(nowSeconds / rule.windowSeconds);
    const resetSeconds = (window + 1) * rule.windowSeconds - nowSeconds;

    const count = await cache.incrAndExpire(
      rateLimitKey(scope, userId, window),
      RATE_LIMIT_KEY_TTL_SECONDS,
    );

    // Fail open. A counter we cannot read is not a reason to refuse service.
    if (count === null) return next();

    const headers: Record<string, string> = {
      "RateLimit-Limit": String(rule.limit),
      "RateLimit-Remaining": String(Math.max(0, rule.limit - count)),
      "RateLimit-Reset": String(resetSeconds),
    };

    if (count > rule.limit) {
      // The one place that renders a problem instead of throwing one: a 429 has
      // to carry `Retry-After` and the RateLimit headers, and a thrown problem
      // is rendered by `app.onError` where there is nowhere to attach them.
      // Same renderer, so the document is identical to every other problem.
      const response = await renderProblem(
        c,
        problems.create("TOO_MANY_REQUESTS", {
          detail: `At most ${rule.limit} requests per ${rule.windowSeconds} seconds.`,
        }),
      );

      for (const [name, value] of Object.entries({
        ...headers,
        "Retry-After": String(resetSeconds),
      })) {
        response.headers.set(name, value);
      }

      return response;
    }

    await next();

    // Written after `next()` resolves, not before. A single request can match
    // more than one scope — every /api/* request also matches "overall" — and
    // writing pre-`next()` realizes `c.res` early: Hono's `set res()` then
    // merges that already-realized response's headers onto whatever the
    // nested chain eventually returns, including a *different*, more specific
    // scope's 429 further down, clobbering its correct blocking numbers with
    // this scope's stale, passing ones. Firing the write after `next()`
    // sidesteps that, because nothing realizes `c.res` ahead of the nested
    // dispatch, so that merge path is never entered — which also fixes the
    // original bug where these headers were dropped entirely on a 404 (see
    // `finalize.ts`, which re-stamps `X-Request-Id` post-`next()` for the same
    // reason).
    //
    // Each middleware's `await next()` unwinds innermost-first, so on an
    // all-pass request "overall" stamps first and the more specific "search"
    // or "write" stamps last, overwriting it — the most specific scope's
    // numbers are what the client sees, which is the semantics the brief
    // wants. If *this* scope blocked, it already returned its own response
    // above and never reaches here. If a *different* scope blocked further
    // down the chain, `c.res.status` is 429 here and is left alone — the
    // blocking scope's headers, including `Retry-After`, stay intact.
    if (c.res.status !== 429) {
      for (const [name, value] of Object.entries(headers)) {
        c.header(name, value);
      }
    }
  };
}
