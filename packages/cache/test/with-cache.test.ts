import { afterAll, beforeEach, expect, inject, test, vi } from "vitest";

import { createCache } from "../src/client.js";
import { flushAll } from "../src/testing.js";
import { withCache } from "../src/with-cache.js";

const url = inject("valkeyUrl");
const cache = createCache(url);

beforeEach(async () => {
  await flushAll(url);
});

afterAll(async () => {
  await cache.close();
});

test("a miss loads, stores, and a second call does not load again", async () => {
  const load = vi.fn(async () => ({ items: [1, 2, 3] }));

  expect(await withCache(cache, "k1", 60, load)).toEqual({ items: [1, 2, 3] });
  expect(await withCache(cache, "k1", 60, load)).toEqual({ items: [1, 2, 3] });
  expect(load).toHaveBeenCalledTimes(1);
});

test("the TTL can be derived from the loaded value", async () => {
  const ttl = vi.fn((value: number[]) => (value.length === 0 ? 60 : 600));

  await withCache(cache, "empty", ttl, async () => []);
  await withCache(cache, "full", ttl, async () => [1]);

  expect(ttl).toHaveBeenNthCalledWith(1, []);
  expect(ttl).toHaveBeenNthCalledWith(2, [1]);
});

test("a dead cache still returns the loaded value, every time", async () => {
  const dead = createCache("redis://127.0.0.1:1");
  const load = vi.fn(async () => "value");

  expect(await withCache(dead, "k", 60, load)).toBe("value");
  expect(await withCache(dead, "k", 60, load)).toBe("value");
  expect(load).toHaveBeenCalledTimes(2);

  await dead.close();
});
