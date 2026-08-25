import { afterAll, expect, inject, test } from "vitest";

import { createCache } from "../src/client.js";

const cache = createCache(inject("valkeyUrl"));

afterAll(async () => {
  await cache.close();
});

test("values round-trip as JSON", async () => {
  await cache.set("games:1", { id: 1, name: "Hades" }, 60);

  expect(await cache.get<{ id: number; name: string }>("games:1")).toEqual({
    id: 1,
    name: "Hades",
  });
});

test("a missing key reads as null", async () => {
  expect(await cache.get("nope")).toBeNull();
});

test("a zero TTL does not write", async () => {
  await cache.set("zero", "x", 0);
  expect(await cache.get("zero")).toBeNull();
});

test("incr counts up from nothing, which is how search:ver works", async () => {
  expect(await cache.incr("search:ver")).toBe(1);
  expect(await cache.incr("search:ver")).toBe(2);
});

test("ping reports a healthy connection, which /readyz depends on", async () => {
  expect(await cache.ping()).toBe(true);
});

test("a dead Valkey fails open rather than throwing", async () => {
  // Spec §10: the cache must never be able to take the service down.
  const dead = createCache("redis://127.0.0.1:1");

  expect(await dead.get("anything")).toBeNull();
  await expect(dead.set("anything", "value", 60)).resolves.toBeUndefined();
  expect(await dead.incr("counter")).toBeNull();
  expect(await dead.ping()).toBe(false);

  await dead.close();
});
