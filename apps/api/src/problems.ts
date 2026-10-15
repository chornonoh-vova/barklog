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
import type { ProblemCode } from "@repo/contracts";

export const PROBLEM_BASE = "https://barklog.gg/problems";

/**
 * `code` marks the problems the app shows to a person: it translates by code
 * and falls back to `detail` for one it does not know.
 */
function definition(status: number, code?: ProblemCode) {
  const slug = statusToSlug(status);
  const title = statusToPhrase(status);

  if (!slug || !title) throw new Error(`No problem definition for HTTP ${status}`);

  return { type: `${PROBLEM_BASE}/${slug}`, status, title, code };
}

export const problems = createProblemTypeRegistry({
  UNAUTHORIZED: definition(401, "unauthorized"),
  NOT_FOUND: definition(404),
  GAME_NOT_FOUND: definition(404, "game_not_found"),
  BACKLOG_ENTRY_NOT_FOUND: definition(404, "backlog_entry_not_found"),
  BACKLOG_CAP_REACHED: definition(402, "backlog_cap_reached"),
  CONTENT_TOO_LARGE: definition(413),
  UNSUPPORTED_MEDIA_TYPE: definition(415),
  SHARE_INVALID_URL: definition(422, "share_invalid_url"),
  SHARE_SOURCE_GONE: definition(404, "share_source_gone"),
  SHARE_SOURCE_BLOCKED: definition(422, "share_source_blocked"),
  SHARE_SOURCE_UNREADABLE: definition(422, "share_source_unreadable"),
  SHARE_FETCH_FAILED: definition(502, "share_fetch_failed"),
  UNPROCESSABLE_WEBHOOK: definition(422),
  TOO_MANY_REQUESTS: definition(429),
  BAD_GATEWAY: definition(502),
  SERVICE_UNAVAILABLE: definition(503),
});

export type ProblemKey = Parameters<typeof problems.create>[0];

/**
 * A 5xx must never carry `detail`: the library would put the exception message
 * there, and those leak schema names, file paths and connection strings.
 */
function mapError(error: Error): ProblemDetailsInput | undefined {
  if (error instanceof HTTPException && error.status >= 500) {
    return { status: error.status };
  }

  return undefined;
}

const render = problemDetailsHandler({
  typePrefix: PROBLEM_BASE,
  autoInstance: true,
  mapError,
  localize: (pd, c) => ({
    extensions: { ...pd.extensions, traceId: c.get("requestId") },
  }),
});

export async function renderProblem(c: Context, problem: ProblemDetailsError): Promise<Response> {
  return render(problem, c);
}

export const apiErrorHandler: ErrorHandler = (error, c) => {
  if (!(error instanceof ProblemDetailsError)) {
    const status = error instanceof HTTPException ? error.status : 500;
    const log = getLogger(["api", "error"]);
    const properties = { status, message: error.message, stack: error.stack };

    if (status >= 500) {
      log.error("Unhandled error: {message}", properties);
    } else {
      log.warn("Unhandled error: {message}", properties);
    }
  }

  return render(error, c);
};

export const notFoundHandler: NotFoundHandler = (c) =>
  renderProblem(
    c,
    problems.create("NOT_FOUND", {
      detail: `No route matches ${c.req.method} ${c.req.path}.`,
    }),
  );

export const onInvalid = standardSchemaProblemHook();
