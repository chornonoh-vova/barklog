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
  const dead = createCache("redis://127.0.0.1:1");

  expect(await dead.get("anything")).toBeNull();
  await expect(dead.set("anything", "value", 60)).resolves.toBeUndefined();
  expect(await dead.incr("counter")).toBeNull();
  expect(await dead.ping()).toBe(false);

  await dead.close();
});

test("incrAndExpire counts and puts a TTL on the key in one round trip", async () => {
  expect(await cache.incrAndExpire("rl:search:user_1:9000", 120)).toBe(1);
  expect(await cache.incrAndExpire("rl:search:user_1:9000", 120)).toBe(2);

  const ttl = await cache.ttlSeconds("rl:search:user_1:9000");
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(120);
});

test("incrAndExpire fails open, so a Valkey outage cannot reject requests", async () => {
  const dead = createCache("redis://127.0.0.1:1");
  expect(await dead.incrAndExpire("rl:search:user_1:9000", 120)).toBeNull();
  await dead.close();
});
