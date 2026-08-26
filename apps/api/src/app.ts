import { honoLogger } from "@logtape/hono";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import { finalize } from "./middleware/finalize.js";
import { apiErrorHandler, notFoundHandler, problems, renderProblem } from "./problems.js";
import { PROBE_PATHS, type AppDeps, type AppEnv } from "./types.js";

/** The largest legitimate body in the whole API is `{status, rating}`. */
export const BODY_LIMIT_BYTES = 16 * 1024;

/**
 * `SecureHeadersOptions` is not exported from `hono/secure-headers`, so the
 * option type is recovered from the function signature.
 */
export function secureHeaderOptions(production: boolean): Parameters<typeof secureHeaders>[0] {
  return {
    // Meaningless over plain HTTP, and on localhost it would pin a developer's
    // browser to https for two years.
    strictTransportSecurity: production ? "max-age=63072000; includeSubDomains; preload" : false,
    // Stops `application/problem+json` being sniffed as something executable.
    xContentTypeOptions: "nosniff",
    // The API returns zero HTML, so the correct policy is "nothing at all".
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
  const app = new Hono<AppEnv>()
    // First, so it also covers error responses and the probes.
    .use("*", secureHeaders(secureHeaderOptions(deps.production ?? false)))
    .use("*", finalize())
    // Before the logger, so every line for a request carries the same id.
    .use("*", requestId())
    .use(
      "*",
      honoLogger({
        category: ["api", "http"],
        // A liveness probe every few seconds would drown the log in noise, and
        // its outcome is already visible to whoever is probing it.
        skip: (c) => PROBE_PATHS.has(c.req.path),
        context: {
          // `requestId()` above already generated or accepted the id and owns
          // the response header; this only copies it into LogTape's implicit
          // context, so every record written while handling the request — the
          // request log line, a query warning, a 500 — carries the same traceId
          // without anyone passing it down.
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
    // Liveness: no I/O, no dependency checks. An orchestrator restarts the
    // container when this fails, so it must not depend on Postgres.
    .get("/healthz", (c) => c.json({ status: "ok" } as const));

  app.notFound(notFoundHandler);
  app.onError(apiErrorHandler);

  return app;
}

/** Shared with the mobile app for end-to-end typed calls via Hono's RPC client. */
export type AppType = ReturnType<typeof createApp>;
