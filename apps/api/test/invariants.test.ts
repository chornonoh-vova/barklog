import { readFile } from "node:fs/promises";

import { hc } from "hono/client";
import { afterAll, beforeEach, expect, test } from "vitest";

import type { AppType } from "../src/app.js";
import { problems } from "../src/problems.js";
import { callApi, createTestApp, seedGame } from "./helpers.js";

const harness = createTestApp();

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("the API cannot reach IGDB, and the manifest is what guarantees it", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });

  expect(names).not.toContain("@repo/igdb");
  expect(names.filter((name) => name.toLowerCase().includes("igdb"))).toEqual([]);
});

test("AppType still exposes every route the mobile client calls", () => {
  const client = hc<AppType>("http://api.test");

  // `hc` is a Proxy, so the runtime assertions are a formality: the real
  // guarantee is that a broken route chain would not compile.
  expect(typeof client.healthz.$get).toBe("function");
  expect(typeof client.readyz.$get).toBe("function");
  expect(typeof client.api.games.search.$get).toBe("function");
  expect(typeof client.api.games.popular.$get).toBe("function");
  expect(typeof client.api.games.upcoming.$get).toBe("function");
  expect(typeof client.api.games.recent.$get).toBe("function");
  expect(typeof client.api.games[":id"].$get).toBe("function");
  expect(typeof client.api.backlog.$get).toBe("function");
  expect(typeof client.api.backlog.stats.$get).toBe("function");
  expect(typeof client.api.backlog[":gameId"].$put).toBe("function");
  expect(typeof client.api.backlog[":gameId"].$delete).toBe("function");
  expect(typeof client.api.sync.status.$get).toBe("function");
});

test("every error the API can produce is a problem document", async () => {
  await seedGame(harness.db, { id: 1, name: "Alpha Protocol", count: 100 });

  interface Case {
    label: string;
    path: string;
    init?: RequestInit & { user?: string | null };
    libraryValidationShape?: true;
  }

  const cases: Case[] = [
    { label: "401", path: "/api/backlog", init: { user: null } },
    { label: "404 route", path: "/nope" },
    { label: "404 game", path: "/api/games/999999" },
    { label: "404 entry", path: "/api/backlog/1", init: { method: "DELETE" } },
    {
      label: "415",
      path: "/api/backlog/1",
      init: { method: "PUT", headers: { "Content-Type": "text/plain" }, body: "x" },
    },
    {
      label: "400",
      path: "/api/backlog/1",
      init: { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{" },
    },
    { label: "422", path: "/api/games/search?q=z", libraryValidationShape: true },
  ];

  for (const testCase of cases) {
    const response = await callApi(harness.app, testCase.path, testCase.init);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status, testCase.label).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("content-type"), testCase.label).toContain(
      "application/problem+json",
    );
    expect(body.status, testCase.label).toBe(response.status);
    expect(body.title, testCase.label).toBeTruthy();
    expect(response.headers.get("x-request-id"), testCase.label).toBeTruthy();

    if (testCase.libraryValidationShape) {
      expect(body.type, testCase.label).toBe("about:blank");
      continue;
    }

    expect(body.type, testCase.label).toMatch(/^https:\/\/barklog\.gg\/problems\//);
    expect(body.instance, testCase.label).toBeTruthy();
    expect(body.traceId, testCase.label).toBe(response.headers.get("x-request-id"));
  }
});

test("the registry's type URIs are the library's slugs", () => {
  expect(problems.types().map((key) => problems.get(key).type)).toEqual([
    "https://barklog.gg/problems/unauthorized",
    "https://barklog.gg/problems/not-found",
    "https://barklog.gg/problems/content-too-large",
    "https://barklog.gg/problems/unsupported-media-type",
    "https://barklog.gg/problems/too-many-requests",
    "https://barklog.gg/problems/service-unavailable",
  ]);
});

test("sync status reports the last run, and null before the worker has ever run", async () => {
  const empty = await callApi(harness.app, "/api/sync/status");
  expect(empty.status).toBe(200);
  expect(await empty.json()).toEqual({ lastRun: null });
  expect(empty.headers.get("cache-control")).toBe("no-store");

  await harness.db.execute(
    "insert into sync_runs (status, finished_at, watermark, counts) values ('success', now(), now(), '{\"games\": 10}'::jsonb)",
  );

  const populated = await callApi(harness.app, "/api/sync/status");
  const body = (await populated.json()) as { lastRun: Record<string, unknown> | null };

  expect(body.lastRun).toMatchObject({ status: "success", counts: { games: 10 } });
  expect(body.lastRun).not.toHaveProperty("error");
});
