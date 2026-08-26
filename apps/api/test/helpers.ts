import { createCache, type Cache } from "@repo/cache";
import { flushAll } from "@repo/cache/testing";
import { createDb } from "@repo/db";
import { truncateAll } from "@repo/db/testing";
import { configureLogging } from "@repo/logging";
import { recordingSink } from "@repo/logging/testing";
import { expect, inject } from "vitest";

import { createApp } from "../src/app.js";
import type { AppDeps, Db } from "../src/types.js";

export const TEST_USER = "user_2testAAA";
export const OTHER_USER = "user_2testBBB";

/**
 * Logging is configured here, at import time, rather than in `globalSetup`:
 * `globalSetup` runs in its own process, and LogTape's configuration is
 * process-global. Every test file imports this module, so every test file gets a
 * configured logger and a sink it can read back.
 */
export const logs = recordingSink();

await configureLogging({ service: "api", level: "debug", sink: logs.sink });

export interface TestHarness {
  app: ReturnType<typeof createApp>;
  db: Db;
  cache: Cache;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function createTestApp(overrides: Partial<AppDeps> = {}): TestHarness {
  const valkeyUrl = inject("valkeyUrl");
  const { db, close: closeDb } = createDb(inject("databaseUrl"));
  const cache = createCache(valkeyUrl);

  const app = createApp({
    db,
    cache,
    // Production, so the header suite sees the full set including HSTS.
    production: true,
    ...overrides,
  });

  return {
    app,
    db,
    cache,
    reset: async () => {
      await truncateAll(db);
      await flushAll(valkeyUrl);
      logs.clear();
    },
    close: async () => {
      await closeDb();
      await cache.close();
    },
  };
}

/**
 * Every integration test calls the app through here. That is what makes spec
 * §11's "always a problem document" an invariant of the whole suite rather than
 * a handful of assertions: any request that ends 4xx or 5xx anywhere in these
 * tests fails here unless it carries the right media type.
 *
 * 304 is exempt by definition — it carries no body at all.
 *
 * `user` sets the header the fake authenticator of Task 7 reads. Pass
 * `user: null` to make an unauthenticated request.
 */
export async function callApi(
  app: TestHarness["app"],
  path: string,
  init: RequestInit & { user?: string | null } = {},
): Promise<Response> {
  const { user = TEST_USER, ...requestInit } = init;

  const headers = new Headers(requestInit.headers);
  if (user) headers.set("X-Test-User", user);

  const response = await app.request(path, { ...requestInit, headers });

  if (response.status >= 400) {
    expect(
      response.headers.get("content-type"),
      `${requestInit.method ?? "GET"} ${path} answered ${response.status} without a problem document`,
    ).toContain("application/problem+json");
  }

  return response;
}
