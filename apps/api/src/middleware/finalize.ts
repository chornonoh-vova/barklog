import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types.js";

/** The whole API is authenticated, so anything unstated must not be stored. */
export const DEFAULT_CACHE_CONTROL = "no-store";

const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * Two fixes applied to the finished response, whoever built it.
 *
 * `Cache-Control` is a default rather than a per-route obligation: forgetting
 * `no-store` on a new authenticated route is a real mistake, while forgetting to
 * override the default on a cacheable one is only a missed optimisation.
 *
 * `X-Request-Id` is re-stamped because `requestId()` sets it as a *prepared*
 * header. Prepared headers survive `c.json()`, but a problem document is a fresh
 * `Response` built by the problem renderer, and they do not survive that — so
 * without this the one response class where the id matters most would be the one
 * class missing it. The body still carries `traceId`; this keeps the header
 * matching it.
 */
export function finalize(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();

    if (!c.res.headers.has("Cache-Control")) {
      c.res.headers.set("Cache-Control", DEFAULT_CACHE_CONTROL);
    }

    const requestId = c.get("requestId");
    if (requestId && !c.res.headers.has(REQUEST_ID_HEADER)) {
      c.res.headers.set(REQUEST_ID_HEADER, requestId);
    }
  };
}
