import { PROBLEM_CODES, type ProblemCode, type ProblemDocument } from "@repo/contracts";

export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  /** Present only for a code this build has copy for. */
  readonly code?: ProblemCode;
  readonly detail?: string;
  readonly toFree?: number;
  readonly traceId?: string;
  readonly errors?: { field: string; message: string }[];
  /** Seconds, from `Retry-After`. */
  readonly retryAfter?: number;

  constructor(fields: {
    status: number;
    type: string;
    title: string;
    code?: ProblemCode;
    detail?: string;
    toFree?: number;
    traceId?: string;
    errors?: { field: string; message: string }[];
    retryAfter?: number;
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
    this.code = fields.code;
    this.detail = fields.detail;
    this.toFree = fields.toFree;
    this.traceId = fields.traceId;
    this.errors = fields.errors;
    this.retryAfter = fields.retryAfter;
  }
}

function isProblemDocument(body: unknown): body is Partial<ProblemDocument> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

function isProblemCode(value: unknown): value is ProblemCode {
  return PROBLEM_CODES.includes(value as ProblemCode);
}

/** `response.status` wins over the body's, which a proxy may have rewritten. */
export function toApiError(response: Response, body: unknown, retryAfter?: number): ApiError {
  const problem = isProblemDocument(body) ? body : undefined;
  const str = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;

  return new ApiError({
    status: response.status,
    type: str(problem?.type) ?? "about:blank",
    title: str(problem?.title) ?? (response.statusText || "Request failed"),
    // A code from a newer API is dropped, so `errorCopy` falls back to `detail`.
    code: isProblemCode(problem?.code) ? problem.code : undefined,
    detail: str(problem?.detail),
    toFree: typeof problem?.toFree === "number" ? problem.toFree : undefined,
    traceId: str(problem?.traceId),
    errors: Array.isArray(problem?.errors) ? problem.errors : undefined,
    retryAfter,
  });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
