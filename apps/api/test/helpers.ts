import { createCache, type Cache } from "@repo/cache";
import { flushAll } from "@repo/cache/testing";
import { createDb, schema } from "@repo/db";
import { truncateAll } from "@repo/db/testing";
import { configureLogging } from "@repo/logging";
import { recordingSink } from "@repo/logging/testing";
import { expect, inject } from "vitest";

import { createApp } from "../src/app.js";
import type { AuthProvider } from "../src/middleware/auth.js";
import type { AppDeps, Db } from "../src/types.js";

export const TEST_USER = "user_2testAAA";
export const OTHER_USER = "user_2testBBB";

export const fakeAuthProvider: AuthProvider = {
  authenticate: (c) => c.req.header("X-Test-User") ?? null,
};

// Configured at import time, not in `globalSetup`: that runs in its own
// process, and LogTape's configuration is process-global.
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
    auth: fakeAuthProvider,
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

export async function seedGame(
  db: Db,
  game: {
    id: number;
    name: string;
    count?: number;
    rating?: number | null;
    typeId?: number;
    firstReleaseDate?: Date | null;
    coverImageId?: string | null;
  },
): Promise<void> {
  await db
    .insert(schema.gameTypes)
    .values({ id: game.typeId ?? 0, name: "Main Game" })
    .onConflictDoNothing();

  await db.insert(schema.games).values({
    id: game.id,
    name: game.name,
    slug: game.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
    gameTypeId: game.typeId ?? 0,
    totalRating: game.rating === undefined ? 85 : game.rating,
    totalRatingCount: game.count ?? 100,
    firstReleaseDate: game.firstReleaseDate ?? null,
    coverImageId: game.coverImageId === undefined ? `co${game.id}` : game.coverImageId,
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
}

export async function seedSimilar(db: Db, gameId: number, similarIds: number[]): Promise<void> {
  await db
    .insert(schema.gameSimilar)
    .values(similarIds.map((similarGameId) => ({ gameId, similarGameId })));
}
