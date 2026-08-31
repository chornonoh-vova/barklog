import { createCache } from "@repo/cache";
import { afterAll, beforeEach, expect, test } from "vitest";

import { DEFAULT_RATE_LIMITS } from "../src/rate-limits.js";
import { callApi, createTestApp } from "./helpers.js";

const harness = createTestApp({
  rateLimits: { search: { limit: 2, windowSeconds: 60 } },
});

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("the configured limits are the ones the spec states", () => {
  expect(DEFAULT_RATE_LIMITS).toEqual({
    search: { limit: 30, windowSeconds: 60 },
    write: { limit: 60, windowSeconds: 60 },
    overall: { limit: 300, windowSeconds: 60 },
  });
});

test("a request under the limit carries the RateLimit headers", async () => {
  const response = await callApi(harness.app, "/api/games/search?q=zelda");

  expect(response.headers.get("ratelimit-limit")).toBe("2");
  expect(response.headers.get("ratelimit-remaining")).toBe("1");
  expect(Number(response.headers.get("ratelimit-reset"))).toBeGreaterThan(0);
});

test("one request past the limit is a 429 problem document with Retry-After", async () => {
  await callApi(harness.app, "/api/games/search?q=zelda");
  await callApi(harness.app, "/api/games/search?q=zelda");
  const blocked = await callApi(harness.app, "/api/games/search?q=zelda");

  expect(blocked.status).toBe(429);
  expect(await blocked.json()).toMatchObject({
    type: "https://barklog.gg/problems/too-many-requests",
    title: "Too Many Requests",
    status: 429,
  });
  expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  expect(blocked.headers.get("ratelimit-remaining")).toBe("0");
});

test("the counter is per user, so one noisy client cannot block another", async () => {
  await callApi(harness.app, "/api/games/search?q=zelda");
  await callApi(harness.app, "/api/games/search?q=zelda");

  const other = await callApi(harness.app, "/api/games/search?q=zelda", {
    user: "user_2someoneElse",
  });

  expect(other.status).not.toBe(429);
});

test("scopes count separately", async () => {
  const scoped = createTestApp({
    rateLimits: { write: { limit: 1, windowSeconds: 60 } },
  });

  await callApi(scoped.app, "/api/backlog/1", { method: "DELETE" });
  expect((await callApi(scoped.app, "/api/backlog/1", { method: "DELETE" })).status).toBe(429);

  expect((await callApi(scoped.app, "/api/games/search?q=zelda")).status).not.toBe(429);

  await scoped.close();
});

test("the overall scope counts every /api request", async () => {
  const scoped = createTestApp({
    rateLimits: { overall: { limit: 2, windowSeconds: 60 } },
  });

  await callApi(scoped.app, "/api/backlog");
  await callApi(scoped.app, "/api/games/search?q=zelda");
  expect((await callApi(scoped.app, "/api/backlog")).status).toBe(429);

  await scoped.close();
});

test("a broader scope's block reports its own headers, not a narrower passing scope's", async () => {
  const scoped = createTestApp({
    rateLimits: { overall: { limit: 1, windowSeconds: 60 } },
  });

  await callApi(scoped.app, "/api/games/search?q=zelda");
  const blocked = await callApi(scoped.app, "/api/games/search?q=zelda");

  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("ratelimit-limit")).toBe("1");
  expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);

  await scoped.close();
});

test("the probes are never rate limited", async () => {
  const scoped = createTestApp({
    rateLimits: { overall: { limit: 1, windowSeconds: 60 } },
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect((await callApi(scoped.app, "/healthz", { user: null })).status).toBe(200);
  }

  await scoped.close();
});

test("a Valkey outage cannot reject a request", async () => {
  const failOpen = createTestApp({
    cache: createCache("redis://127.0.0.1:1"),
    rateLimits: { overall: { limit: 1, windowSeconds: 60 } },
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    expect((await callApi(failOpen.app, "/api/backlog")).status).not.toBe(429);
  }

  await failOpen.close();
});
