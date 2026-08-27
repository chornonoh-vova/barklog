import type { ProblemDocument } from "@repo/contracts";

/**
 * Every non-2xx from the API becomes one of these. The API guarantees
 * `application/problem+json` on every error it produces itself, but a failure
 * upstream of it — a proxy 502, a captive portal — will not be one, so parsing
 * must degrade to the status line rather than throwing a JSON error where an
 * HTTP error happened.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail?: string;
  readonly traceId?: string;
  readonly errors?: { field: string; message: string }[];
  /** Seconds, from `Retry-After`. Present on a 429. */
  readonly retryAfter?: number;

  constructor(fields: {
    status: number;
    type: string;
    title: string;
    detail?: string;
    traceId?: string;
    errors?: { field: string; message: string }[];
    retryAfter?: number;
    /**
     * The original error `fetch` threw (DNS failure, ATS blocking plain
     * HTTP, connection refused, …), when this `ApiError` wraps one. Threaded
     * through via ES2022's `Error` cause chain rather than discarded, since
     * it is often the only signal that explains *why* a request failed the
     * first time someone points a device build at a LAN IP.
     */
    cause?: unknown;
  }) {
    super(
      fields.detail === undefined
        ? `${fields.status} ${fields.title}`
        : `${fields.status} ${fields.title}: ${fields.detail}`,
      fields.cause === undefined ? undefined : { cause: fields.cause },
    );

    this.name = "ApiError";
    this.status = fields.status;
    this.type = fields.type;
    this.title = fields.title;
    this.detail = fields.detail;
    this.traceId = fields.traceId;
    this.errors = fields.errors;
    this.retryAfter = fields.retryAfter;
  }
}

function isProblemDocument(body: unknown): body is Partial<ProblemDocument> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

/**
 * `response.status` always wins over the body's `status` member. A proxy
 * rewriting one must not be able to make the app believe a failure was
 * something else — and the two disagreeing is itself a sign of a body that
 * cannot be trusted.
 */
export function toApiError(response: Response, body: unknown, retryAfter?: number): ApiError {
  const problem = isProblemDocument(body) ? body : undefined;

  return new ApiError({
    status: response.status,
    type: typeof problem?.type === "string" ? problem.type : "about:blank",
    title:
      typeof problem?.title === "string" ? problem.title : response.statusText || "Request failed",
    detail: typeof problem?.detail === "string" ? problem.detail : undefined,
    traceId: typeof problem?.traceId === "string" ? problem.traceId : undefined,
    errors: Array.isArray(problem?.errors) ? problem.errors : undefined,
    retryAfter,
  });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
