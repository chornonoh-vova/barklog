import { createCache } from "@repo/cache";
import { createDb } from "@repo/db";
import { afterAll, expect, test } from "vitest";

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
  // Spec §12 records the cost: the cache is fail-open, so the API still serves
  // every request correctly with Valkey down, and a strict probe will pull a
  // working instance out of rotation. The trade buys a probe that reports the
  // true state of the dependencies. Reverting it is one branch.
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
  // 503 is a 5xx: no detail, no driver error string, no hostname. These are
  // unauthenticated endpoints.
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

  // The distinction is the whole point: a Postgres blip must not restart pods.
  expect((await callApi(harnessWithDeadCache.app, "/healthz")).status).toBe(200);
  expect((await callApi(harnessWithDeadCache.app, "/readyz")).status).toBe(503);

  await harnessWithDeadCache.close();
});
