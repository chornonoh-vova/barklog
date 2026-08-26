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

    // A single request can pass through more than one scope — every /api/*
    // request also matches "overall". Reading `c.res.headers` here (a) forces
    // Hono to realize `c.res` now, so these headers survive a handler that
    // builds its own bespoke `Response` rather than going through `c.json()`
    // (every request in this suite ends at `notFoundHandler`, which does
    // exactly that via `renderProblem` — see `finalize.ts`, which re-stamps
    // `X-Request-Id` for the same reason), and (b) tells us whether a more
    // specific, earlier-registered scope already reported its headers. If so,
    // that scope's numbers are the ones that matter to the client and are left
    // alone; a broader scope still counts and can still block, just silently.
    if (!c.res.headers.has("RateLimit-Limit")) {
      for (const [name, value] of Object.entries(headers)) {
        c.header(name, value);
      }
    }

    await next();
  };
}
