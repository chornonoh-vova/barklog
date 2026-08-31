import { createCache, type Cache } from "@repo/cache";
import { createDb } from "@repo/db";
import { afterAll, expect, inject, test } from "vitest";

import { READINESS_CACHE_MS } from "../src/routes/probes.js";
import { callApi, createTestApp } from "./helpers.js";

const harness = createTestApp();

afterAll(async () => {
  await harness.close();
});

test("readyz is 200 with both dependencies up", async () => {
  const response = await callApi(harness.app, "/readyz");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    checks: { postgres: "up", valkey: "up" },
  });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("a Valkey outage takes readiness down, by decision", async () => {
  const dead = createCache("redis://127.0.0.1:1");
  const harnessWithDeadCache = createTestApp({ cache: dead });

  const response = await callApi(harnessWithDeadCache.app, "/readyz");
  const body = (await response.json()) as Record<string, unknown>;

  expect(response.status).toBe(503);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  expect(body).toMatchObject({
    type: "https://barklog.gg/problems/service-unavailable",
    status: 503,
    checks: { postgres: "up", valkey: "down" },
  });
  expect(body.detail).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("127.0.0.1");

  await harnessWithDeadCache.close();
});

test("a Postgres outage takes readiness down too", async () => {
  const { db, close } = createDb("postgres://barklog:barklog@127.0.0.1:1/barklog");
  const harnessWithDeadDb = createTestApp({ db });

  const response = await callApi(harnessWithDeadDb.app, "/readyz");

  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    checks: { postgres: "down", valkey: "up" },
  });

  await close();
  await harnessWithDeadDb.close();
});

test("liveness stays up when readiness is down", async () => {
  const dead = createCache("redis://127.0.0.1:1");
  const harnessWithDeadCache = createTestApp({ cache: dead });

  expect((await callApi(harnessWithDeadCache.app, "/healthz")).status).toBe(200);
  expect((await callApi(harnessWithDeadCache.app, "/readyz")).status).toBe(503);

  await harnessWithDeadCache.close();
});

// `createTestApp` closes only the cache it creates itself, so the caller must
// close this one.
function countingPingCache(): {
  cache: Cache;
  pingCount: () => number;
  close: () => Promise<void>;
} {
  const real = createCache(inject("valkeyUrl"));
  let count = 0;

  return {
    cache: {
      ...real,
      ping: () => {
        count += 1;
        return real.ping();
      },
    },
    pingCount: () => count,
    close: () => real.close(),
  };
}

test("two rapid /readyz calls perform the dependency checks once", async () => {
  const { cache, pingCount, close } = countingPingCache();
  const memoHarness = createTestApp({ cache });

  const [first, second] = await Promise.all([
    callApi(memoHarness.app, "/readyz"),
    callApi(memoHarness.app, "/readyz"),
  ]);

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(pingCount()).toBe(1);

  await memoHarness.close();
  await close();
});

test("a call after the memo expires checks the dependencies again", async () => {
  const { cache, pingCount, close } = countingPingCache();
  const memoHarness = createTestApp({ cache });

  expect((await callApi(memoHarness.app, "/readyz")).status).toBe(200);
  expect(pingCount()).toBe(1);

  await new Promise((resolve) => setTimeout(resolve, READINESS_CACHE_MS + 200));

  expect((await callApi(memoHarness.app, "/readyz")).status).toBe(200);
  expect(pingCount()).toBe(2);

  await memoHarness.close();
  await close();
}, 10_000);
