import { afterAll, beforeEach, expect, test } from "vitest";

import { callApi, createTestApp, TEST_USER } from "./helpers.js";

const harness = createTestApp();

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("the two probes are public", async () => {
  expect((await callApi(harness.app, "/healthz", { user: null })).status).toBe(200);
  expect((await callApi(harness.app, "/readyz", { user: null })).status).toBe(200);
});

test("everything else is 401 without a session", async () => {
  const response = await callApi(harness.app, "/api/backlog", { user: null });

  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/unauthorized",
    status: 401,
  });
});

test("the allowlist is by exact path, so no future /health-debug is public", async () => {
  // Spec §8. A prefix allowlist is the mistake this test exists to prevent.
  expect((await callApi(harness.app, "/healthz/extra", { user: null })).status).toBe(401);
  expect((await callApi(harness.app, "/health-debug", { user: null })).status).toBe(401);
});

test("an authenticated request gets past auth and on to routing", async () => {
  // No /api/backlog route exists yet, so reaching a 404 is the proof that the
  // 401 gate opened.
  expect((await callApi(harness.app, "/api/backlog")).status).toBe(404);
});

test("a mutating request provisions the user row just in time", async () => {
  await callApi(harness.app, "/api/backlog/1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "playing" }),
  });

  const rows = await harness.db.execute("select id from users");
  expect(rows.rows).toEqual([{ id: TEST_USER }]);
});

test("a read does not provision anything", async () => {
  await callApi(harness.app, "/api/backlog");

  const rows = await harness.db.execute("select id from users");
  expect(rows.rows).toEqual([]);
});

test("provisioning twice is not an error", async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await callApi(harness.app, "/api/backlog/1", {
      method: "DELETE",
    });
  }

  const rows = await harness.db.execute("select id from users");
  expect(rows.rows).toHaveLength(1);
});
