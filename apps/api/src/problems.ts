import { getLogger } from "@logtape/logtape";
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createProblemTypeRegistry,
  problemDetailsHandler,
  ProblemDetailsError,
  statusToPhrase,
  statusToSlug,
  type ProblemDetailsInput,
} from "hono-problem-details";
import { standardSchemaProblemHook } from "hono-problem-details/standard-schema";

/** Stable identifiers. They are not required to resolve. */
export const PROBLEM_BASE = "https://barklog.gg/problems";

/**
 * Slug and title both come from the library's status tables, so there is no
 * second naming scheme to keep in step and no hand-written string to get wrong.
 * The throw is a load-time assertion: every status below is in those tables, and
 * a typo should stop the process rather than ship an `about:blank` type.
 */
function definition(status: number) {
  const slug = statusToSlug(status);
  const title = statusToPhrase(status);

  if (!slug || !title) throw new Error(`No problem definition for HTTP ${status}`);

  return { type: `${PROBLEM_BASE}/${slug}`, status, title };
}

/**
 * The problem types **we** raise. Three more reach the wire without a key here,
 * deliberately:
 *
 * - `400 bad-request` and `500 internal-server-error`, from the library's own
 *   handling of an `HTTPException` and of an unhandled bug;
 * - `422 unprocessable-content`, from `zodProblemHook` (Task 9).
 *
 * The first two still land under `PROBLEM_BASE`, because `typePrefix` derives
 * their URI from the same `statusToSlug` this file uses. The 422 does not — see
 * the note at the end of this step.
 */
export const problems = createProblemTypeRegistry({
  UNAUTHORIZED: definition(401),
  NOT_FOUND: definition(404),
  CONTENT_TOO_LARGE: definition(413),
  UNSUPPORTED_MEDIA_TYPE: definition(415),
  TOO_MANY_REQUESTS: definition(429),
  SERVICE_UNAVAILABLE: definition(503),
});

export type ProblemKey = Parameters<typeof problems.create>[0];

/**
 * The library puts an `HTTPException`'s message into `detail`. On a 4xx that is
 * exactly right — "Malformed JSON in request body" is what the client needs. On
 * a 5xx it is a leak: exception messages carry schema names, file paths and
 * connection strings. Returning the bare status drops the message and lets the
 * library derive the type and title as usual.
 *
 * Everything else returns `undefined`, which is how the library's own branches
 * stay in charge.
 */
function mapError(error: Error): ProblemDetailsInput | undefined {
  if (error instanceof HTTPException && error.status >= 500) {
    return { status: error.status };
  }

  return undefined;
}

const render = problemDetailsHandler({
  // Where a library-raised problem gets its type URI.
  typePrefix: PROBLEM_BASE,
  autoInstance: true,
  mapError,
  // The library can read a trace id from OpenTelemetry, which we do not run.
  // This is the hook that puts our request id on every document instead.
  localize: (pd, c) => ({
    extensions: { ...pd.extensions, traceId: c.get("requestId") },
  }),
});

/**
 * For the one caller that needs to add response headers to a problem — the rate
 * limiter and its `Retry-After`. Everything else throws and lets `app.onError`
 * do this.
 */
export async function renderProblem(c: Context, problem: ProblemDetailsError): Promise<Response> {
  return render(problem, c);
}

/**
 * `app.onError`. It sees three kinds of thing: a `ProblemDetailsError` thrown
 * deliberately, an `HTTPException` from Hono, and a genuine bug. Only the last
 * two are worth a log line — a thrown problem is a documented outcome, and it is
 * already in the request log with its status.
 */
export const apiErrorHandler: ErrorHandler = (error, c) => {
  if (!(error instanceof ProblemDetailsError)) {
    getLogger(["api", "error"]).error("Unhandled error: {message}", {
      status: error instanceof HTTPException ? error.status : 500,
      message: error.message,
      stack: error.stack,
    });
  }

  return render(error, c);
};

/** `app.notFound`. Same renderer, so an unmatched route is not a special case. */
export const notFoundHandler: NotFoundHandler = (c) =>
  renderProblem(
    c,
    problems.create("NOT_FOUND", {
      detail: `No route matches ${c.req.method} ${c.req.path}.`,
    }),
  );

/**
 * The validation failure hook, passed to every `sValidator` call. The library's
 * own, used as-is and with no options, so the 422's `errors[]`, title and detail
 * are all its defaults.
 *
 * It needs no wrapper and no cast. Everything in the chain speaks Standard
 * Schema — `sValidator`'s hook hands over `readonly StandardSchemaV1.Issue[]`,
 * which is exactly what this consumes — so there is no library-specific error
 * class to reconcile.
 */
export const onInvalid = standardSchemaProblemHook();
