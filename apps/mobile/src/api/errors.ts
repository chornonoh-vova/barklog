import type { ProblemDocument } from "@repo/contracts";

export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail?: string;
  readonly traceId?: string;
  readonly errors?: { field: string; message: string }[];
  /** Seconds, from `Retry-After`. */
  readonly retryAfter?: number;

  constructor(fields: {
    status: number;
    type: string;
    title: string;
    detail?: string;
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
    this.detail = fields.detail;
    this.traceId = fields.traceId;
    this.errors = fields.errors;
    this.retryAfter = fields.retryAfter;
  }
}

function isProblemDocument(body: unknown): body is Partial<ProblemDocument> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
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
    detail: str(problem?.detail),
    traceId: str(problem?.traceId),
    errors: Array.isArray(problem?.errors) ? problem.errors : undefined,
    retryAfter,
  });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
