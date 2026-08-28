import { schema } from "@repo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, test } from "vitest";

import { SEARCH_VERSION_KEY } from "../src/cache-keys.js";
import { callApi, createTestApp, OTHER_USER, seedGame, TEST_USER } from "./helpers.js";

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
  // valibot's wording, passed through untouched.
  expect(body.errors[0]?.message).toBe("Invalid length: Expected >=2 but received 1");
  // The library's shape and wording, adopted as-is (Task 5, Step 7): `about:blank`
  // rather than a barklog type, and no instance or traceId in the body.
  expect(body.type).toBe("about:blank");
  expect(body.title).toBe("Validation Error");
  expect(body.detail).toBe("Request validation failed");
  // The header is what keeps a 422 traceable.
  expect(response.headers.get("x-request-id")).toBeTruthy();
});

test("a limit over the cap is 422 rather than silently clamped", async () => {
  const response = await callApi(harness.app, "/api/games/search?q=zelda&limit=500");
  const body = (await response.json()) as { errors: { field: string }[] };

  expect(response.status).toBe(422);
  expect(body.errors[0]?.field).toBe("limit");
});

test("a non-numeric limit is 422, not a silent fallback to the default", async () => {
  // `integerFrom` coerces with `Number`, so junk becomes NaN and fails the
  // `v.number()` check rather than passing through as 20.
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

  // Remove the row the answer came from. A cached answer cannot notice.
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

  // This is exactly what the worker does at the end of a successful run.
  await harness.cache.incr(SEARCH_VERSION_KEY);

  const fresh = await callApi(harness.app, "/api/games/search?q=hades");
  expect(((await fresh.json()) as { items: unknown[] }).items).toHaveLength(0);
});

test("a cache hit and a cache miss are byte-identical", async () => {
  // Dates must be serialised before they are cached, or a hit would answer with
  // strings where a miss answered with Date objects.
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

/**
 * The release routes read `new Date()` themselves, so their fixtures are
 * relative to the real clock. Whole days of margin, so a run at any hour lands
 * each fixture on the intended side of the UTC day boundary the feeds split on.
 */
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

test("a release feed with no cover art shows nothing, however well timed", async () => {
  await seedGame(harness.db, {
    id: 1,
    name: "Placeholder Listing",
    firstReleaseDate: daysFromNow(2),
    coverImageId: null,
  });

  const response = await callApi(harness.app, "/api/games/upcoming");

  expect(((await response.json()) as { items: unknown[] }).items).toEqual([]);
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
  // Never max-age: the response is user-varying (embeds the caller's
  // backlogEntry), so it must be revalidated rather than reused (spec §8).
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
  // Regression guard for spec §8/§17: wrapping this route in withCache with a
  // key that is not user-scoped would let this test pass every OTHER
  // assertion in the suite (each test gets a fresh cache flush in
  // beforeEach) while still leaking TEST_USER's backlogEntry to OTHER_USER
  // within a single request sequence. Two calls in one test, no flush
  // between, is what actually exercises that.
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
  // games.id is a Postgres `integer` column; 2147483648 overflows it. Without
  // the MAX_GAME_ID bound in the contract this reaches the query layer and
  // Postgres rejects it, which surfaces as a 500 with a stack trace.
  const response = await callApi(harness.app, "/api/games/2147483648");
  const body = (await response.json()) as { errors: { field: string }[] };

  expect(response.status).toBe(422);
  expect(body.errors[0]?.field).toBe("id");
});
