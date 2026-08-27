import { ApiError, toApiError } from "./errors";

export interface RequestOptions {
  method?: "GET" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export type Request = <T>(path: string, options?: RequestOptions) => Promise<T>;

export interface ApiClientDeps {
  baseUrl: string;
  /** Clerk's `getToken`. `skipCache` forces a refresh. */
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
  /** Injected in tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

function buildUrl(baseUrl: string, path: string, query: RequestOptions["query"]): string {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  if (!query) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }

  const serialised = search.toString();
  return serialised === "" ? url : `${url}?${serialised}`;
}

/**
 * The transport layer. No React, so its branching is unit-testable in Node —
 * and this is the layer most likely to be wrong.
 */
export function createRequest(deps: ApiClientDeps): Request {
  const doFetch = deps.fetchImpl ?? fetch;

  async function send(
    path: string,
    options: RequestOptions,
    { skipTokenCache = false, reload = false } = {},
  ): Promise<Response> {
    const token = await deps.getToken(skipTokenCache ? { skipCache: true } : undefined);
    if (token === null) {
      throw new ApiError({
        status: 401,
        type: "about:blank",
        title: "Not signed in",
        detail: "No session token is available.",
      });
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };
    // Only when there is a body: a DELETE carries none, and sending a
    // Content-Type on it would make the API's requireJson middleware reject it.
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    const url = buildUrl(deps.baseUrl, path, options.query);

    try {
      return await doFetch(url, {
        method: options.method ?? "GET",
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        ...(reload ? { cache: "reload" as RequestCache } : {}),
      });
    } catch (cause) {
      // A DNS failure, a dropped connection, ATS refusing plain HTTP. Wrapped
      // so every caller catches exactly one error type, but the original is
      // threaded through as `cause` rather than discarded — it is often the
      // only signal that explains why, and the generic message above collapses
      // all of those causes into one otherwise.
      throw new ApiError({
        status: 0,
        type: "about:blank",
        title: "Network unavailable",
        detail: "Barklog could not reach the server. Check your connection.",
        cause,
      });
    }
  }

  async function parse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;

    if (!response.ok) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfter =
        retryAfterHeader === null ? undefined : Number.parseInt(retryAfterHeader, 10);

      throw toApiError(
        response,
        await response.json().catch(() => null),
        Number.isNaN(retryAfter) ? undefined : retryAfter,
      );
    }

    return (await response.json()) as T;
  }

  return async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let response = await send(path, options);

    // `GET /api/backlog` is ETag'd, and NSURLSession performs the
    // If-None-Match revalidation itself, handing us a transparent 200 with the
    // stored body — a bare 304 normally never arrives here. If one does, ask
    // for the body rather than parsing an empty one. Deliberately NOT solved by
    // threading TanStack's cached value in: that would reimplement, in JS,
    // revalidation the URL loading system already does correctly.
    if (response.status === 304) {
      response = await send(path, options, { reload: true });

      if (response.status === 304) {
        throw new ApiError({
          status: 304,
          type: "about:blank",
          title: "Not modified",
          detail: "The server returned 304 for a request that asked for a fresh copy.",
        });
      }
    }

    // Clerk refreshes proactively, so a 401 here means a revoked session rather
    // than an expired token. One retry with a forced refresh, then give up —
    // retrying past that is a loop.
    if (response.status === 401) {
      response = await send(path, options, { skipTokenCache: true });
    }

    return parse<T>(response);
  };
}
