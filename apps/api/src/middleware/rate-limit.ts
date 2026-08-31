import type { Cache } from "@repo/cache";
import type { MiddlewareHandler } from "hono";

import { problems, renderProblem } from "../problems.js";
import type { RateLimitRule, RateLimitScope } from "../rate-limits.js";
import type { AppEnv } from "../types.js";

function rateLimitKey(scope: RateLimitScope, userId: string, window: number): string {
  return `rl:${scope}:${userId}:${window}`;
}

export function rateLimit(
  cache: Cache,
  scope: RateLimitScope,
  rule: RateLimitRule,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const userId = c.get("userId");
    if (!userId) return next();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const window = Math.floor(nowSeconds / rule.windowSeconds);
    const resetSeconds = (window + 1) * rule.windowSeconds - nowSeconds;

    // Must outlive the window it counts, or the key expires mid-window and
    // silently resets the count.
    const keyTtlSeconds = rule.windowSeconds * 2;

    const count = await cache.incrAndExpire(rateLimitKey(scope, userId, window), keyTtlSeconds);

    if (count === null) return next();

    const headers: Record<string, string> = {
      "RateLimit-Limit": String(rule.limit),
      "RateLimit-Remaining": String(Math.max(0, rule.limit - count)),
      "RateLimit-Reset": String(resetSeconds),
    };

    if (count > rule.limit) {
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

    // After `next()`, never before: writing early realizes `c.res`, and Hono
    // then merges those headers onto whatever the nested chain returns —
    // clobbering a more specific scope's 429 numbers with this scope's passing
    // ones. Unwinding is innermost-first, so the most specific scope stamps
    // last. A 429 from another scope is left alone so its `Retry-After` stands.
    if (c.res.status !== 429) {
      for (const [name, value] of Object.entries(headers)) {
        c.header(name, value);
      }
    }
  };
}
