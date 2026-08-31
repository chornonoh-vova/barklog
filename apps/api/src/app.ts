import { honoLogger } from "@logtape/hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { MiddlewareHandler } from "hono";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import { ensureUserMiddleware, requireAuth } from "./middleware/auth.js";
import { finalize } from "./middleware/finalize.js";
import { requireJson } from "./middleware/json.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { apiErrorHandler, notFoundHandler, problems, renderProblem } from "./problems.js";
import { DEFAULT_RATE_LIMITS } from "./rate-limits.js";
import { backlogRoutes } from "./routes/backlog.js";
import { gamesRoutes } from "./routes/games.js";
import { probeRoutes } from "./routes/probes.js";
import { syncRoutes } from "./routes/sync.js";
import { MUTATING_METHODS, PROBE_PATHS, type AppDeps, type AppEnv } from "./types.js";

const passthrough: MiddlewareHandler = (_c, next) => next();

export const BODY_LIMIT_BYTES = 16 * 1024;

export function secureHeaderOptions(production: boolean): Parameters<typeof secureHeaders>[0] {
  return {
    // Off outside production: on localhost this pins the browser to https for years.
    strictTransportSecurity: production ? "max-age=63072000; includeSubDomains; preload" : false,
    xContentTypeOptions: "nosniff",
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
    xFrameOptions: "DENY",
    referrerPolicy: "no-referrer",
    crossOriginResourcePolicy: "same-origin",
    crossOriginOpenerPolicy: "same-origin",
    xPermittedCrossDomainPolicies: "none",
    removePoweredBy: true,
  };
}

export function createApp(deps: AppDeps) {
  const limits = { ...DEFAULT_RATE_LIMITS, ...deps.rateLimits };

  const app = new Hono<AppEnv>()
    .use("*", secureHeaders(secureHeaderOptions(deps.production ?? false)))
    .use("*", finalize())
    .use("*", requestId())
    .use(
      "*",
      honoLogger({
        category: ["api", "http"],
        skip: (c) => PROBE_PATHS.has(c.req.path),
        context: {
          requestId: false,
          enrich: (c) => ({ traceId: c.get("requestId") }),
        },
      }),
    )
    .use(
      "*",
      bodyLimit({
        maxSize: BODY_LIMIT_BYTES,
        onError: (c) =>
          renderProblem(
            c,
            problems.create("CONTENT_TOO_LARGE", {
              detail: `Request body must be at most ${BODY_LIMIT_BYTES} bytes.`,
            }),
          ),
      }),
    )
    .use("*", deps.auth.middleware ?? passthrough)
    .use("*", requireAuth(deps.auth.authenticate))
    // After auth (needs the Clerk sub), most specific scope first.
    .use("/api/games/search", rateLimit(deps.cache, "search", limits.search))
    .on(["POST"], "/api/games/identify", rateLimit(deps.cache, "identify", limits.identify))
    .on([...MUTATING_METHODS], "/api/backlog/*", rateLimit(deps.cache, "write", limits.write))
    .use("/api/*", rateLimit(deps.cache, "overall", limits.overall))
    // Not `MUTATING_METHODS`: a `DELETE` sends no `Content-Type`, so it would
    // turn every delete into a 415.
    .on(["PUT", "POST", "PATCH"], "/api/*", requireJson())
    .on([...MUTATING_METHODS], "/api/*", ensureUserMiddleware(deps.db))
    .route("/api/games", gamesRoutes(deps))
    .route("/api/backlog", backlogRoutes(deps))
    .route("/api/sync", syncRoutes(deps))
    .route("/", probeRoutes(deps));

  app.notFound(notFoundHandler);
  app.onError(apiErrorHandler);

  return app;
}

export type AppType = ReturnType<typeof createApp>;
