import { expect, test, vi } from "vitest";

import { createIgdbClient, PAGE_SIZE } from "../src/client.js";
import { eroticGameIdsQuery, gamesPageQuery } from "../src/games-query.js";
import { createThrottle } from "../src/throttle.js";

const tokens = { get: async () => "tok_abc" };
const fastThrottle = createThrottle({ concurrency: 4, minIntervalMs: 0 });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("sends the IGDB headers and an APIcalypse body", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse([{ id: 1 }]));
  const client = createIgdbClient({
    clientId: "cid",
    tokens,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    throttle: fastThrottle,
  });

  await client.gamesPage({ since: null, afterId: 0 });

  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.igdb.com/v4/games");
  expect(init.method).toBe("POST");
  expect((init.headers as Record<string, string>)["Client-ID"]).toBe("cid");
  expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok_abc");
  expect(init.body).toContain("sort id asc;");
});

test("retries a 429 and then succeeds", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
    .mockResolvedValueOnce(jsonResponse([{ id: 5 }]));

  const client = createIgdbClient({
    clientId: "cid",
    tokens,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    throttle: fastThrottle,
    retryBaseMs: 1,
  });

  await expect(client.gamesPage({ since: null, afterId: 0 })).resolves.toEqual([{ id: 5 }]);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("gives up after five attempts on persistent 5xx", async () => {
  const fetchImpl = vi.fn(async () => new Response("down", { status: 503 }));
  const client = createIgdbClient({
    clientId: "cid",
    tokens,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    throttle: fastThrottle,
    retryBaseMs: 1,
  });

  await expect(client.gamesPage({ since: null, afterId: 0 })).rejects.toThrow(/503/);
  expect(fetchImpl).toHaveBeenCalledTimes(5);
});

test("a 400 is not retried — a bad query will never succeed", async () => {
  const fetchImpl = vi.fn(async () => new Response("bad field", { status: 400 }));
  const client = createIgdbClient({
    clientId: "cid",
    tokens,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    throttle: fastThrottle,
    retryBaseMs: 1,
  });

  await expect(client.gamesPage({ since: null, afterId: 0 })).rejects.toThrow(/400/);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("the seed query has no updated_at filter", () => {
  const query = gamesPageQuery({ since: null, afterId: 0, limit: 500 });

  expect(query).toContain("where id > 0;");
  expect(query).not.toContain("updated_at >");
  expect(query).toContain("limit 500;");
});

test("the incremental query filters on updated_at in unix seconds", () => {
  const query = gamesPageQuery({
    since: new Date("2026-08-20T00:00:00Z"),
    afterId: 1200,
    limit: 500,
  });

  expect(query).toContain(`where updated_at > 1787184000 & id > 1200;`);
});

test("keyset paging sorts by id so pages cannot overlap or skip", () => {
  expect(gamesPageQuery({ since: null, afterId: 0, limit: 500 })).toContain("sort id asc;");
});

test("eroticGameIds posts the sweep query to the games endpoint", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse([{ id: 123467 }, { id: 286990 }]));
  const client = createIgdbClient({
    clientId: "cid",
    tokens,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    throttle: fastThrottle,
  });

  const rows = await client.eroticGameIds({ afterId: 0 });

  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://api.igdb.com/v4/games");
  expect(init.body).toBe(eroticGameIdsQuery({ afterId: 0, limit: PAGE_SIZE }));
  expect(rows).toEqual([{ id: 123467 }, { id: 286990 }]);
});
