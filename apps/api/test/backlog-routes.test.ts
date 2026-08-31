import { afterAll, beforeEach, expect, test } from "vitest";

import { BODY_LIMIT_BYTES } from "../src/app.js";
import { callApi, createTestApp, OTHER_USER, seedGame } from "./helpers.js";

const harness = createTestApp();

const json = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(async () => {
  await harness.reset();
  await seedGame(harness.db, { id: 1, name: "Alpha Protocol", count: 100 });
  await seedGame(harness.db, { id: 2, name: "Beta Decay", count: 200 });
});

afterAll(async () => {
  await harness.close();
});

test("a first PUT creates with 201 and a second updates with 200", async () => {
  const created = await callApi(harness.app, "/api/backlog/1", json({ status: "waiting" }));
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({ gameId: 1, status: "waiting", rating: null });

  const updated = await callApi(
    harness.app,
    "/api/backlog/1",
    json({ status: "completed", rating: 9 }),
  );
  expect(updated.status).toBe(200);
  expect(await updated.json()).toMatchObject({ status: "completed", rating: 9 });
});

test("a resent identical PUT is harmless, which is what makes offline retry safe", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));
  const resent = await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));

  expect(resent.status).toBe(200);
  const list = await callApi(harness.app, "/api/backlog");
  expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(1);
});

test("a PUT for a game outside the mirror is 404, not a foreign-key crash", async () => {
  const response = await callApi(harness.app, "/api/backlog/999999", json({ status: "waiting" }));

  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/not-found",
  });
});

test("an out-of-range rating is 422 naming the field", async () => {
  const response = await callApi(
    harness.app,
    "/api/backlog/1",
    json({ status: "playing", rating: 11 }),
  );

  expect(response.status).toBe(422);
  const body = (await response.json()) as { errors: { field: string }[] };
  expect(body.errors[0]!.field).toBe("rating");
});

test("an unknown status is 422 naming the field", async () => {
  const response = await callApi(harness.app, "/api/backlog/1", json({ status: "finished" }));

  expect(response.status).toBe(422);
  const body = (await response.json()) as { errors: { field: string }[] };
  expect(body.errors[0]!.field).toBe("status");
});

test("an unknown key is rejected, and the offending key is named", async () => {
  const response = await callApi(
    harness.app,
    "/api/backlog/1",
    json({ status: "playing", note: "hi" }),
  );
  const body = (await response.json()) as { errors: { field: string; message: string }[] };
  const error = body.errors[0]!;

  expect(response.status).toBe(422);
  expect(error.field).toBe("note");
});

test("a body that is not JSON is 415", async () => {
  const response = await callApi(harness.app, "/api/backlog/1", {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: "status=playing",
  });

  expect(response.status).toBe(415);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/unsupported-media-type",
  });
});

test("malformed JSON is 400, distinct from a validation failure", async () => {
  const response = await callApi(harness.app, "/api/backlog/1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/bad-request",
  });
});

test("an oversized body is 413 before the route sees it", async () => {
  const response = await callApi(
    harness.app,
    "/api/backlog/1",
    json({ status: "playing", padding: "x".repeat(BODY_LIMIT_BYTES) }),
  );

  expect(response.status).toBe(413);
});

test("DELETE removes once and is 404 the second time", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));

  const removed = await callApi(harness.app, "/api/backlog/1", { method: "DELETE" });
  expect(removed.status).toBe(204);
  expect(await removed.text()).toBe("");

  const again = await callApi(harness.app, "/api/backlog/1", { method: "DELETE" });
  expect(again.status).toBe(404);
});

test("the list is the caller's own, joined to game summaries", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));
  await callApi(harness.app, "/api/backlog/2", { ...json({ status: "completed", rating: 8 }) });
  await callApi(harness.app, "/api/backlog/1", {
    ...json({ status: "waiting" }),
    user: OTHER_USER,
  });

  const response = await callApi(harness.app, "/api/backlog");
  const body = (await response.json()) as {
    items: { gameId: number; game: { name: string } }[];
  };

  expect(response.status).toBe(200);
  expect(body.items).toHaveLength(2);
  expect(body.items.map((item) => item.game.name).sort()).toEqual(["Alpha Protocol", "Beta Decay"]);
});

test("the list filters by status and sorts on request", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));
  await callApi(harness.app, "/api/backlog/2", json({ status: "completed", rating: 8 }));

  const playing = await callApi(harness.app, "/api/backlog?status=playing");
  const playingBody = (await playing.json()) as { items: { gameId: number }[] };
  expect(playingBody.items.map((item) => item.gameId)).toEqual([1]);

  const byName = await callApi(harness.app, "/api/backlog?sort=name");
  const byNameBody = (await byName.json()) as { items: { gameId: number }[] };
  expect(byNameBody.items.map((item) => item.gameId)).toEqual([1, 2]);

  const badSort = await callApi(harness.app, "/api/backlog?sort=id");
  expect(badSort.status).toBe(422);
});

test("the list revalidates with an ETag and answers 304 on a match", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));

  const first = await callApi(harness.app, "/api/backlog");
  const etag = first.headers.get("etag");

  expect(etag).toBeTruthy();
  expect(first.headers.get("cache-control")).toBe("private, no-cache");

  const revalidated = await callApi(harness.app, "/api/backlog", {
    headers: { "If-None-Match": etag! },
  });

  expect(revalidated.status).toBe(304);
  expect(await revalidated.text()).toBe("");
  expect(revalidated.headers.get("etag")).toBe(etag);
  expect(revalidated.headers.get("x-request-id")).toBeTruthy();
  expect(revalidated.headers.get("x-content-type-options")).toBe("nosniff");
});

test("the ETag changes when the collection does", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));
  const before = (await callApi(harness.app, "/api/backlog")).headers.get("etag");

  await callApi(harness.app, "/api/backlog/2", json({ status: "waiting" }));
  const after = (await callApi(harness.app, "/api/backlog")).headers.get("etag");

  expect(after).not.toBe(before);
});

test("a wildcard If-None-Match revalidates too", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "playing" }));

  const response = await callApi(harness.app, "/api/backlog", {
    headers: { "If-None-Match": "*" },
  });

  expect(response.status).toBe(304);
});

test("stats count every status and average only the rated entries", async () => {
  await callApi(harness.app, "/api/backlog/1", json({ status: "completed", rating: 8 }));
  await callApi(harness.app, "/api/backlog/2", json({ status: "waiting" }));

  const response = await callApi(harness.app, "/api/backlog/stats");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    total: 2,
    counts: { waiting: 1, playing: 0, completed: 1, abandoned: 0 },
    averageRating: 8,
  });
});

test("stats on an empty backlog are zeroes, not a 404", async () => {
  const response = await callApi(harness.app, "/api/backlog/stats");

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ total: 0, averageRating: null });
});
