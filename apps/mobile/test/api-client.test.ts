import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRequest } from "@/api/client";
import { isApiError } from "@/api/errors";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const problem = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json", ...headers },
  });

let calls: { url: string; init: RequestInit }[];
let getToken: ReturnType<
  typeof vi.fn<(options?: { skipCache?: boolean }) => Promise<string | null>>
>;

function client(responses: Response[]) {
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url: string | URL | globalThis.Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra fetch call");
    return next;
  }) as unknown as typeof fetch;

  return createRequest({ baseUrl: "http://api.test", getToken, fetchImpl });
}

beforeEach(() => {
  calls = [];
  getToken = vi.fn(async () => "tok_abc");
});

describe("createRequest — request shape", () => {
  it("joins the path onto the base URL", async () => {
    await client([json({ items: [] })])("/api/backlog");

    expect(calls[0]?.url).toBe("http://api.test/api/backlog");
  });

  it("tolerates a base URL with a trailing slash", async () => {
    const request = createRequest({
      baseUrl: "http://api.test/",
      getToken,
      fetchImpl: (async () => json({ ok: true })) as unknown as typeof fetch,
    });

    await expect(request("/api/backlog")).resolves.toEqual({ ok: true });
  });

  it("sends the Clerk token as a bearer credential", async () => {
    await client([json({ items: [] })])("/api/backlog");

    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok_abc");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("omits Content-Type when there is no body", async () => {
    await client([json({ items: [] })])("/api/backlog");

    expect(new Headers(calls[0]?.init.headers).get("Content-Type")).toBeNull();
  });

  it("sets Content-Type and serialises the body on a PUT", async () => {
    await client([json({ gameId: 1 })])("/api/backlog/1", {
      method: "PUT",
      body: { status: "playing", rating: 8 },
    });

    expect(new Headers(calls[0]?.init.headers).get("Content-Type")).toBe("application/json");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ status: "playing", rating: 8 }));
    expect(calls[0]?.init.method).toBe("PUT");
  });

  it("builds a query string and drops undefined parameters", async () => {
    await client([json({ items: [] })])("/api/games/search", {
      query: { q: "dark souls", limit: 20, offset: undefined },
    });

    expect(calls[0]?.url).toBe("http://api.test/api/games/search?q=dark+souls&limit=20");
  });

  it("throws without calling fetch when there is no token", async () => {
    getToken = vi.fn(async () => null);

    await expect(client([])("/api/backlog")).rejects.toThrow(/not signed in/i);
    expect(calls).toHaveLength(0);
  });
});

describe("createRequest — responses", () => {
  it("parses a JSON body", async () => {
    await expect(client([json({ items: [{ id: 1 }] })])("/api/backlog")).resolves.toEqual({
      items: [{ id: 1 }],
    });
  });

  it("returns undefined for a 204", async () => {
    await expect(
      client([new Response(null, { status: 204 })])("/api/backlog/1", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });

  it("refetches once with cache: reload on a bare 304", async () => {
    const result = await client([
      new Response(null, { status: 304 }),
      json({ items: [{ id: 7 }] }),
    ])("/api/backlog");

    expect(result).toEqual({ items: [{ id: 7 }] });
    expect(calls).toHaveLength(2);
    expect((calls[1]?.init as { cache?: string }).cache).toBe("reload");
  });

  it("throws if the 304 repeats after the reload", async () => {
    await expect(
      client([new Response(null, { status: 304 }), new Response(null, { status: 304 })])(
        "/api/backlog",
      ),
    ).rejects.toThrow(/not modified/i);
  });
});

describe("createRequest — errors", () => {
  it("throws an ApiError built from the problem document", async () => {
    const error = await client([
      problem(404, { type: "x/not-found", title: "Not Found", status: 404, detail: "nope" }),
    ])("/api/games/999").catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    expect(isApiError(error) && error.status).toBe(404);
    expect(isApiError(error) && error.detail).toBe("nope");
  });

  it("reads Retry-After into the error on a 429", async () => {
    const error = await client([
      problem(429, { title: "Too Many Requests", status: 429 }, { "Retry-After": "42" }),
    ])("/api/games/search").catch((e: unknown) => e);

    expect(isApiError(error) && error.retryAfter).toBe(42);
  });

  it("leaves retryAfter undefined, not NaN, for a non-numeric Retry-After", async () => {
    const error = await client([
      problem(429, { title: "Too Many Requests", status: 429 }, { "Retry-After": "soon" }),
    ])("/api/games/search").catch((e: unknown) => e);

    expect(isApiError(error) && error.retryAfter).toBeUndefined();
  });

  it("survives an error body that is not JSON", async () => {
    const error = await client([
      new Response("<html>502</html>", { status: 502, statusText: "Bad Gateway" }),
    ])("/api/backlog").catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(502);
    expect(isApiError(error) && error.title).toBe("Bad Gateway");
  });

  it("retries a 401 exactly once with a fresh token, then succeeds", async () => {
    const result = await client([
      problem(401, { title: "Unauthorized", status: 401 }),
      json({ items: [] }),
    ])("/api/backlog");

    expect(result).toEqual({ items: [] });
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
  });

  it("gives up after one 401 retry rather than looping", async () => {
    const error = await client([
      problem(401, { title: "Unauthorized", status: 401 }),
      problem(401, { title: "Unauthorized", status: 401 }),
    ])("/api/backlog").catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(401);
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("wraps a network failure so callers only ever catch an ApiError", async () => {
    const request = createRequest({
      baseUrl: "http://api.test",
      getToken,
      fetchImpl: (async () => {
        throw new TypeError("Network request failed");
      }) as unknown as typeof fetch,
    });

    const error = await request("/api/backlog").catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(0);
    expect(isApiError(error) && error.title).toMatch(/offline|network/i);
  });
});
