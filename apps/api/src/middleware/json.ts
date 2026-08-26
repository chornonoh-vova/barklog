import type { MiddlewareHandler } from "hono";

import { problems } from "../problems.js";
import type { AppEnv } from "../types.js";

const JSON_CONTENT_TYPE = /^application\/(?:[\w.+-]+\+)?json\b/i;

/**
 * Hono's validator treats a non-JSON body as an empty object, which surfaces as
 * a 422 about missing fields — misleading when the real problem is the media
 * type. This turns that case into the 415 spec §11 asks for, before validation.
 */
export function requireJson(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const contentType = c.req.header("Content-Type");

    if (!contentType || !JSON_CONTENT_TYPE.test(contentType)) {
      throw problems.create("UNSUPPORTED_MEDIA_TYPE", {
        detail: "Request body must be application/json.",
      });
    }

    await next();
  };
}
