import { schema } from "@repo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";

import { SEARCH_VERSION_KEY } from "../src/cache-keys.js";
import { callApi, createTestApp, OTHER_USER, seedGame, seedSimilar, TEST_USER } from "./helpers.js";

const harness = createTestApp();

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("search returns ranked summaries and a private short-lived cache directive", async () => {
  await seedGame(harness.db, {
    id: 1,
    name: "The Legend of Zelda: Breath of the Wild",
    count: 3000,
  });
  await seedGame(harness.db, { id: 2, name: "Zeldas Adventure", count: 3 });

  const response = await callApi(harness.app, "/api/games/search?q=zeld");
  const body = (await response.json()) as { items: { id: number; name: string }[] };

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, max-age=60");
  expect(body.items[0]?.id).toBe(1);
  expect(body.items).toHaveLength(2);
});

test("a one-character query is 422, naming the field that failed", async () => {
  const response = await callApi(harness.app, "/api/games/search?q=z");
  const body = (await response.json()) as {
    errors: { field: string; message: string }[];
    type: string;
    title: string;
    detail: string;
  };

  expect(response.status).toBe(422);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  expect(body.errors[0]?.field).toBe("q");
  expect(body.errors[0]?.message).toBe("Invalid length: Expected >=2 but received 1");
  expect(body.type).toBe("about:blank");
  expect(body.title).toBe("Validation Error");
  expect(body.detail).toBe("Request validation failed");
  expect(response.headers.get("x-request-id")).toBeTruthy();
});

test("a limit over the cap is 422 rather than silently clamped", async () => {
  const response = await callApi(harness.app, "/api/games/search?q=zelda&limit=500");
  const body = (await response.json()) as { errors: { field: string }[] };

  expect(response.status).toBe(422);
  expect(body.errors[0]?.field).toBe("limit");
});

test("a non-numeric limit is 422, not a silent fallback to the default", async () => {
  const response = await callApi(harness.app, "/api/games/search?q=zelda&limit=abc");
  const body = (await response.json()) as { errors: { field: string; message: string }[] };

  expect(response.status).toBe(422);
  expect(body.errors[0]).toMatchObject({
    field: "limit",
    message: "Invalid type: Expected number but received NaN",
  });
});

test("a repeated search is served from the cache", async () => {
  await seedGame(harness.db, { id: 1, name: "Hades", count: 900 });

  const first = await callApi(harness.app, "/api/games/search?q=hades");
  expect(((await first.json()) as { items: unknown[] }).items).toHaveLength(1);

  await harness.db.delete(schema.games).where(eq(schema.games.id, 1));

  const second = await callApi(harness.app, "/api/games/search?q=hades");
  expect(((await second.json()) as { items: unknown[] }).items).toHaveLength(1);
});

test("normalisation means casing and spacing share one cache entry", async () => {
  await seedGame(harness.db, { id: 1, name: "Hades", count: 900 });

  await callApi(harness.app, "/api/games/search?q=hades");
  await harness.db.delete(schema.games).where(eq(schema.games.id, 1));

  const padded = await callApi(harness.app, "/api/games/search?q=%20%20HADES%20%20");
  expect(((await padded.json()) as { items: unknown[] }).items).toHaveLength(1);
});

test("the version bump the sync performs invalidates every cached search at once", async () => {
  await seedGame(harness.db, { id: 1, name: "Hades", count: 900 });

  await callApi(harness.app, "/api/games/search?q=hades");
  await harness.db.delete(schema.games).where(eq(schema.games.id, 1));

  await harness.cache.incr(SEARCH_VERSION_KEY);

  const fresh = await callApi(harness.app, "/api/games/search?q=hades");
  expect(((await fresh.json()) as { items: unknown[] }).items).toHaveLength(0);
});

test("a cache hit and a cache miss are byte-identical", async () => {
  await seedGame(harness.db, {
    id: 1,
    name: "Hades",
    count: 900,
    firstReleaseDate: new Date("2020-09-17T00:00:00Z"),
  });

  const miss = await (await callApi(harness.app, "/api/games/search?q=hades")).text();
  const hit = await (await callApi(harness.app, "/api/games/search?q=hades")).text();

  expect(hit).toBe(miss);
  expect(JSON.parse(miss).items[0].firstReleaseDate).toBe("2020-09-17T00:00:00.000Z");
});

test("popular ranks by rating count behind a rating floor", async () => {
  await seedGame(harness.db, { id: 1, name: "Well Loved", count: 500, rating: 90 });
  await seedGame(harness.db, { id: 2, name: "Widely Played, Badly Rated", count: 900, rating: 40 });

  const response = await callApi(harness.app, "/api/games/popular");
  const body = (await response.json()) as { items: { id: number }[] };

  expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  expect(body.items.map((item) => item.id)).toEqual([1]);
});

const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

test("upcoming lists what has not shipped yet, soonest first", async () => {
  await seedGame(harness.db, { id: 1, name: "Ships Later", firstReleaseDate: daysFromNow(60) });
  await seedGame(harness.db, { id: 2, name: "Ships Soon", firstReleaseDate: daysFromNow(2) });
  await seedGame(harness.db, { id: 3, name: "Already Out", firstReleaseDate: daysFromNow(-2) });

  const response = await callApi(harness.app, "/api/games/upcoming");
  const body = (await response.json()) as { items: { id: number }[] };

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  expect(body.items.map((item) => item.id)).toEqual([2, 1]);
});

test("recent lists the games just out, most rated first", async () => {
  await seedGame(harness.db, {
    id: 1,
    name: "Out Last Week, Ignored",
    count: 5,
    firstReleaseDate: daysFromNow(-7),
  });
  await seedGame(harness.db, {
    id: 2,
    name: "Out Last Month, Talked About",
    count: 900,
    firstReleaseDate: daysFromNow(-30),
  });
  await seedGame(harness.db, { id: 3, name: "Out Years Ago", firstReleaseDate: daysFromNow(-800) });
  await seedGame(harness.db, { id: 4, name: "Not Out Yet", firstReleaseDate: daysFromNow(2) });

  const response = await callApi(harness.app, "/api/games/recent");
  const body = (await response.json()) as { items: { id: number }[] };

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  expect(body.items.map((item) => item.id)).toEqual([2, 1]);
});

test("the release feeds cache, and a hit is byte-identical to the miss", async () => {
  await seedGame(harness.db, { id: 1, name: "Ships Soon", firstReleaseDate: daysFromNow(2) });

  const miss = await (await callApi(harness.app, "/api/games/upcoming")).text();
  await harness.db.delete(schema.games).where(eq(schema.games.id, 1));
  const hit = await (await callApi(harness.app, "/api/games/upcoming")).text();

  expect(hit).toBe(miss);
  expect(JSON.parse(hit).items).toHaveLength(1);
});

test("details carry the child collections and the caller's own backlog entry", async () => {
  await seedGame(harness.db, { id: 1942, name: "The Witcher 3: Wild Hunt", count: 4021 });
  await harness.db.insert(schema.users).values({ id: TEST_USER });
  await harness.db
    .insert(schema.backlogEntries)
    .values({ userId: TEST_USER, gameId: 1942, status: "playing", rating: 9 });

  const response = await callApi(harness.app, "/api/games/1942");
  const body = (await response.json()) as {
    id: number;
    genres: unknown[];
    screenshots: unknown[];
    backlogEntry: { status: string; rating: number } | null;
  };

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-cache");
  expect(body.id).toBe(1942);
  expect(body.genres).toEqual([]);
  expect(body.screenshots).toEqual([]);
  expect(body.backlogEntry).toMatchObject({ status: "playing", rating: 9 });
});

test("another user's entry never appears in the caller's game details", async () => {
  await seedGame(harness.db, { id: 1942, name: "The Witcher 3: Wild Hunt", count: 4021 });
  await harness.db.insert(schema.users).values({ id: "user_2somebodyElse" });
  await harness.db
    .insert(schema.backlogEntries)
    .values({ userId: "user_2somebodyElse", gameId: 1942, status: "completed", rating: 3 });

  const response = await callApi(harness.app, "/api/games/1942");
  const body = (await response.json()) as { backlogEntry: unknown };

  expect(body.backlogEntry).toBeNull();
});

test("game details must never enter a shared cache: two users, same request, no flush between", async () => {
  // Two calls in one test, with no cache flush between, is what actually
  // catches a non-user-scoped cache key leaking one user's entry to another.
  await seedGame(harness.db, { id: 1942, name: "The Witcher 3: Wild Hunt", count: 4021 });
  await harness.db.insert(schema.users).values({ id: TEST_USER });
  await harness.db
    .insert(schema.backlogEntries)
    .values({ userId: TEST_USER, gameId: 1942, status: "playing", rating: 9 });

  const asOwner = await callApi(harness.app, "/api/games/1942", { user: TEST_USER });
  const ownerBody = (await asOwner.json()) as { backlogEntry: { status: string } | null };

  const asOther = await callApi(harness.app, "/api/games/1942", { user: OTHER_USER });
  const otherBody = (await asOther.json()) as { backlogEntry: unknown };

  expect(ownerBody.backlogEntry).toMatchObject({ status: "playing" });
  expect(otherBody.backlogEntry).toBeNull();
});

test("an unmirrored id is 404 and a non-numeric id is 422", async () => {
  expect((await callApi(harness.app, "/api/games/999999")).status).toBe(404);
  expect((await callApi(harness.app, "/api/games/abc")).status).toBe(422);
});

test("an id above int4 range is 422, not a 500 from Postgres", async () => {
  const response = await callApi(harness.app, "/api/games/2147483648");
  const body = (await response.json()) as { errors: { field: string }[] };

  expect(response.status).toBe(422);
  expect(body.errors[0]?.field).toBe("id");
});

test("similar games are returned most-rated first with a feed cache directive", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });
  await seedGame(harness.db, { id: 2, name: "Dark Souls III", count: 4000 });
  await seedGame(harness.db, { id: 3, name: "Elden Ring", count: 2000 });
  await seedSimilar(harness.db, 1, [2, 3]);

  const response = await callApi(harness.app, "/api/games/1/similar");
  const body = (await response.json()) as { items: { id: number }[] };

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  expect(body.items.map((item) => item.id)).toEqual([2, 3]);
});

test("a similar id the mirror does not hold is omitted", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });
  await seedSimilar(harness.db, 1, [999_999]);

  const response = await callApi(harness.app, "/api/games/1/similar");

  expect(((await response.json()) as { items: unknown[] }).items).toEqual([]);
});

test("a game with no suggestions is 200 and empty, not 404", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });

  const response = await callApi(harness.app, "/api/games/1/similar");

  expect(response.status).toBe(200);
  expect(((await response.json()) as { items: unknown[] }).items).toEqual([]);
});

test("similar games for an unmirrored id is 404", async () => {
  const response = await callApi(harness.app, "/api/games/424242/similar");
  const body = (await response.json()) as { status: number; detail: string };

  expect(response.status).toBe(404);
  expect(body.detail).toContain("424242");
});

test("a similar-games limit over the cap is 422", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });

  const response = await callApi(harness.app, "/api/games/1/similar?limit=500");
  const body = (await response.json()) as { errors: { field: string }[] };

  expect(response.status).toBe(422);
  expect(body.errors[0]?.field).toBe("limit");
});

test("the default similar-games limit is twelve", async () => {
  await seedGame(harness.db, { id: 1, name: "Subject", count: 10 });
  for (let id = 100; id < 120; id += 1) {
    await seedGame(harness.db, { id, name: `Similar ${id}`, count: id });
  }
  await seedSimilar(
    harness.db,
    1,
    Array.from({ length: 20 }, (_unused, index) => 100 + index),
  );

  const response = await callApi(harness.app, "/api/games/1/similar");

  expect(((await response.json()) as { items: unknown[] }).items).toHaveLength(12);
});

test("a repeated similar-games request is served from the cache", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });
  await seedGame(harness.db, { id: 2, name: "Dark Souls III", count: 4000 });
  await seedSimilar(harness.db, 1, [2]);

  const first = await callApi(harness.app, "/api/games/1/similar");
  expect(((await first.json()) as { items: unknown[] }).items).toHaveLength(1);

  await harness.db.delete(schema.gameSimilar).where(eq(schema.gameSimilar.gameId, 1));

  const second = await callApi(harness.app, "/api/games/1/similar");
  expect(((await second.json()) as { items: unknown[] }).items).toHaveLength(1);
});

test("the version bump the sync performs invalidates cached similar games", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });
  await seedGame(harness.db, { id: 2, name: "Dark Souls III", count: 4000 });
  await seedSimilar(harness.db, 1, [2]);

  await callApi(harness.app, "/api/games/1/similar");
  await harness.db.delete(schema.gameSimilar).where(eq(schema.gameSimilar.gameId, 1));

  await harness.cache.incr(SEARCH_VERSION_KEY);

  const fresh = await callApi(harness.app, "/api/games/1/similar");
  expect(((await fresh.json()) as { items: unknown[] }).items).toEqual([]);
});

test("a similar-games 404 is not cached", async () => {
  expect((await callApi(harness.app, "/api/games/1/similar")).status).toBe(404);

  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });

  expect((await callApi(harness.app, "/api/games/1/similar")).status).toBe(200);
});

test("the similar route is not shadowed by the :id catch-all", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });

  const response = await callApi(harness.app, "/api/games/1/similar");
  const body = (await response.json()) as Record<string, unknown>;

  expect(body).not.toHaveProperty("backlogEntry");
  expect(body).toHaveProperty("items");
});
