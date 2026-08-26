import { HTTPException } from "hono/http-exception";
import { afterAll, beforeEach, expect, test } from "vitest";

import { BODY_LIMIT_BYTES } from "../src/app.js";
import { callApi, createTestApp, logs } from "./helpers.js";

const harness = createTestApp();

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

test("healthz is 200 with no dependency checks at all", async () => {
  const response = await callApi(harness.app, "/healthz");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("finalize does not overwrite a Cache-Control a route set for itself", async () => {
  const custom = createTestApp();
  custom.app.get("/cacheable", (c) =>
    c.json({ ok: true }, 200, { "Cache-Control": "public, max-age=60" }),
  );

  const response = await callApi(custom.app, "/cacheable");

  expect(response.headers.get("cache-control")).toBe("public, max-age=60");

  await custom.close();
});

test("an unknown route is a problem document, not Hono's default text", async () => {
  const response = await callApi(harness.app, "/nope");

  expect(response.status).toBe(404);
  expect(response.headers.get("content-type")).toContain("application/problem+json");
  // The title is the library's reason phrase, verbatim — see Step 7.
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/not-found",
    title: "Not Found",
    status: 404,
    instance: "/nope",
  });
});

test("every problem document carries the traceId echoed in X-Request-Id", async () => {
  const response = await callApi(harness.app, "/nope");
  const body = (await response.json()) as { traceId: string };

  expect(body.traceId).toBeTruthy();
  expect(response.headers.get("x-request-id")).toBe(body.traceId);
});

test("a caller-supplied request id is honoured, so client and server logs join up", async () => {
  const response = await callApi(harness.app, "/healthz", {
    headers: { "X-Request-Id": "abc-123" },
  });

  expect(response.headers.get("x-request-id")).toBe("abc-123");
});

test("the full security header set is present on a 200", async () => {
  const response = await callApi(harness.app, "/healthz");

  expect(response.headers.get("strict-transport-security")).toBe(
    "max-age=63072000; includeSubDomains; preload",
  );
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-security-policy")).toBe(
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  expect(response.headers.get("x-permitted-cross-domain-policies")).toBe("none");
  expect(response.headers.get("x-powered-by")).toBeNull();
  expect(response.headers.get("server")).toBeNull();
});

test("the same header set is present on a problem document", async () => {
  const response = await callApi(harness.app, "/nope");

  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  expect(response.headers.get("strict-transport-security")).toContain("max-age=63072000");
});

test("HSTS is omitted outside production, where it would be meaningless", async () => {
  const dev = createTestApp({ production: false });
  const response = await callApi(dev.app, "/healthz");

  expect(response.headers.get("strict-transport-security")).toBeNull();
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");

  await dev.close();
});

test("a body over the limit is 413, before any handler sees it", async () => {
  const response = await callApi(harness.app, "/nope", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(BODY_LIMIT_BYTES) }),
  });

  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({
    type: "https://barklog.gg/problems/content-too-large",
    title: "Content Too Large",
    status: 413,
  });
});

test("an unhandled exception is a 500 that says nothing about the exception", async () => {
  const boom = createTestApp();
  boom.app.get("/boom", () => {
    throw new Error("connection string postgres://user:secret@host/db failed");
  });

  const response = await callApi(boom.app, "/boom");
  const body = (await response.json()) as Record<string, unknown>;

  expect(response.status).toBe(500);
  expect(body).toMatchObject({
    type: "https://barklog.gg/problems/internal-server-error",
    title: "Internal Server Error",
    status: 500,
    instance: "/boom",
    // The library's fixed string, not the exception's message. It carries no
    // information, which is the point (spec §11).
    detail: "An unexpected error occurred",
  });
  expect(JSON.stringify(body)).not.toContain("secret");
  expect(JSON.stringify(body)).not.toContain("postgres://");
  expect(body.stack).toBeUndefined();
  expect(body.traceId).toBeTruthy();
  // The response is a fresh Response built by the renderer, so this only holds
  // because `finalize` re-stamps the header.
  expect(response.headers.get("x-request-id")).toBe(body.traceId);

  await boom.close();
});

test("a 5xx HTTPException loses its message on the way out", async () => {
  const boom = createTestApp();
  boom.app.get("/upstream", () => {
    // Library default would put this message straight into `detail`.
    throw new HTTPException(503, { message: "pool exhausted at db-primary-3" });
  });

  const body = (await (await callApi(boom.app, "/upstream")).json()) as Record<string, unknown>;

  expect(body).toMatchObject({
    type: "https://barklog.gg/problems/service-unavailable",
    status: 503,
  });
  expect(body.detail).toBeUndefined();
  expect(JSON.stringify(body)).not.toContain("db-primary-3");

  await boom.close();
});

test("a 4xx HTTPException keeps its message, because it is useful", async () => {
  const boom = createTestApp();
  boom.app.get("/teapot", () => {
    throw new HTTPException(400, { message: "Malformed JSON in request body" });
  });

  expect(await (await callApi(boom.app, "/teapot")).json()).toMatchObject({
    type: "https://barklog.gg/problems/bad-request",
    status: 400,
    detail: "Malformed JSON in request body",
  });

  await boom.close();
});

test("one request log line per request, carrying the same traceId", async () => {
  const response = await callApi(harness.app, "/nope");

  const requestLines = logs.records.filter((record) => record.category.includes("http"));
  expect(requestLines).toHaveLength(1);
  expect(requestLines[0]?.properties).toMatchObject({
    method: "GET",
    path: "/nope",
    status: 404,
    traceId: response.headers.get("x-request-id"),
  });
});

test("the probes are not request-logged", async () => {
  await callApi(harness.app, "/healthz");

  expect(logs.records.filter((record) => record.category.includes("http"))).toEqual([]);
});

test("the log line for a bug carries the traceId the client was given", async () => {
  const boom = createTestApp();
  boom.app.get("/boom", () => {
    throw new Error("something broke");
  });

  const response = await callApi(boom.app, "/boom");
  const errorLine = logs.records.find((record) => record.category.includes("error"));

  // This pairing is the only thing that makes a detail-less 500 debuggable.
  expect(errorLine?.properties).toMatchObject({
    message: "something broke",
    traceId: response.headers.get("x-request-id"),
  });
  expect(errorLine?.properties.stack).toBeTruthy();

  await boom.close();
});
