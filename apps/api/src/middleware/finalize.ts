import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types.js";

export const DEFAULT_CACHE_CONTROL = "no-store";

const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * `X-Request-Id` is re-stamped because `requestId()` sets it as a *prepared*
 * header, and those do not survive the fresh `Response` a problem document is
 * built as — leaving the id off the responses that need it most.
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
