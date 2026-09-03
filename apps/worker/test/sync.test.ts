import { createDb, schema } from "@repo/db";
import { truncateAll } from "@repo/db/testing";
import { PAGE_SIZE } from "@repo/igdb";
import { configureLogging, resetLogging } from "@repo/logging";
import { recordingSink } from "@repo/logging/testing";
import { afterAll, beforeEach, expect, inject, test, vi } from "vitest";

import { syncAll } from "../src/sync.js";

const { db, pool, close } = createDb(inject("databaseUrl"));

function game(id: number, updatedAt: number) {
  return {
    id,
    name: `Game ${id}`,
    slug: `game-${id}`,
    updated_at: updatedAt,
    game_type: { id: 0, type: "Main Game" },
  };
}

function stubIgdb(pages: unknown[][], eroticIds: number[] = []) {
  const calls: { since: Date | null; afterId: number }[] = [];
  let index = 0;
  let sweptOnce = false;
  return {
    calls,
    gamesPage: async (options: { since: Date | null; afterId: number }) => {
      calls.push(options);
      return pages[index++] ?? [];
    },
    eroticGameIds: async () => {
      if (sweptOnce) return [];
      sweptOnce = true;
      return eroticIds.map((id) => ({ id }));
    },
  };
}

function stubCache() {
  const incremented: string[] = [];
  return {
    incremented,
    incr: async (key: string) => {
      incremented.push(key);
      return 1;
    },
  };
}

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("a short page ends the run without another request", async () => {
  const igdb = stubIgdb([[game(1, 1700000000), game(2, 1700000100)]]);

  const result = await syncAll({ db, pool, cache: stubCache(), igdb });

  expect(result).toMatchObject({ status: "success" });
  expect(await db.select().from(schema.games)).toHaveLength(2);
  expect(igdb.calls).toEqual([{ since: null, afterId: 0 }]);
});

test("a full page is followed by a request keyed past the highest id seen", async () => {
  const full = Array.from({ length: PAGE_SIZE }, (_, i) => game(i + 1, 1700000000 + i));
  const igdb = stubIgdb([full, [game(PAGE_SIZE + 1, 1700000000)]]);

  await syncAll({ db, pool, cache: stubCache(), igdb });

  expect(await db.select().from(schema.games)).toHaveLength(PAGE_SIZE + 1);
  expect(igdb.calls).toEqual([
    { since: null, afterId: 0 },
    { since: null, afterId: PAGE_SIZE },
  ]);
});

test("the watermark becomes the newest igdb updated_at ingested", async () => {
  const igdb = stubIgdb([[game(1, 1700000000), game(2, 1755000000)]]);

  const result = await syncAll({ db, pool, cache: stubCache(), igdb });

  expect(result).toMatchObject({ status: "success", watermark: new Date(1755000000 * 1000) });
});

test("a second run is incremental, asking only for changes since the watermark", async () => {
  await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[game(1, 1755000000)]]) });

  const second = stubIgdb([[game(2, 1755100000)]]);
  await syncAll({ db, pool, cache: stubCache(), igdb: second });

  expect(second.calls[0]!.since).toEqual(new Date(1755000000 * 1000 - 60_000));
});

test("`full` forces a seed even when a watermark exists", async () => {
  await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[game(1, 1755000000)]]) });

  const second = stubIgdb([[game(2, 1755100000)]]);
  await syncAll({ db, pool, cache: stubCache(), igdb: second }, { full: true });

  expect(second.calls[0]!.since).toBeNull();
});

test("a successful run bumps search:ver so cached searches become unreachable", async () => {
  const cache = stubCache();

  await syncAll({ db, pool, cache, igdb: stubIgdb([[game(1, 1700000000)]]) });

  expect(cache.incremented).toEqual(["search:ver"]);
});

test("a failing page marks the run failed and leaves the watermark alone", async () => {
  await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[game(1, 1755000000)]]) });

  const broken = {
    gamesPage: vi.fn(async () => {
      throw new Error("IGDB returned 503");
    }),
    eroticGameIds: async () => [],
  };
  const result = await syncAll({ db, pool, cache: stubCache(), igdb: broken });

  expect(result).toMatchObject({ status: "failed", error: expect.stringContaining("503") });

  const runs = await db.query.syncRuns.findMany();
  expect(runs.map((run) => run.status).sort()).toEqual(["failed", "success"]);

  const third = stubIgdb([[]]);
  await syncAll({ db, pool, cache: stubCache(), igdb: third });
  expect(third.calls[0]!.since).toEqual(new Date(1755000000 * 1000 - 60_000));
});

test("a failed run does not bump search:ver", async () => {
  const cache = stubCache();
  const broken = {
    gamesPage: async () => {
      throw new Error("boom");
    },
    eroticGameIds: async () => [],
  };

  await syncAll({ db, pool, cache, igdb: broken });

  expect(cache.incremented).toEqual([]);
});

test("a run with nothing to do keeps the previous watermark rather than rewinding it", async () => {
  await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[game(1, 1755000000)]]) });
  const second = await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[]]) });

  expect(second).toMatchObject({ status: "success", watermark: new Date(1755000000 * 1000) });
});

test("a concurrent run is skipped rather than run twice", async () => {
  const held = await pool.connect();
  await held.query("SELECT pg_advisory_lock(8823001)");

  const result = await syncAll({ db, pool, cache: stubCache(), igdb: stubIgdb([[game(1, 1)]]) });

  expect(result).toEqual({ status: "skipped" });
  expect(await db.select().from(schema.games)).toHaveLength(0);

  await held.query("SELECT pg_advisory_unlock(8823001)");
  held.release();
});

test("an empty page ends the run", async () => {
  const full = Array.from({ length: PAGE_SIZE }, (_, i) => game(i + 1, 1700000000 + i));
  const igdb = stubIgdb([full, []]);

  const result = await syncAll({ db, pool, cache: stubCache(), igdb });

  expect(result).toMatchObject({ status: "success" });
  expect(igdb.calls).toHaveLength(2);
  expect(await db.select().from(schema.games)).toHaveLength(PAGE_SIZE);
});

test("every line written during a run carries that run's id", async () => {
  const logs = recordingSink();
  await configureLogging({ service: "worker", level: "debug", sink: logs.sink });

  const deps = {
    db,
    pool,
    cache: stubCache(),
    igdb: stubIgdb([[game(1, 1700000000), game(2, 1700000100)]]),
  };
  const result = await syncAll(deps);

  expect(result.status).toBe("success");

  const runIds = new Set(logs.records.map((record) => record.properties.runId));
  expect(runIds.size).toBe(1);
  expect([...runIds][0]).toBeTruthy();
  expect(logs.records.length).toBeGreaterThan(0);

  await resetLogging();
});

test("a game IGDB re-tagged as erotic loses the screenshots an earlier run stored", async () => {
  const withShots = {
    ...game(700, 1755000000),
    screenshots: [{ id: 10, image_id: "scdirty" }],
  };

  // Clean when the page was ingested, erotic by the time the sweep asks.
  const result = await syncAll({
    db,
    pool,
    cache: stubCache(),
    igdb: stubIgdb([[withShots]], [700]),
  });

  expect(result).toMatchObject({ status: "success" });
  expect(await db.select().from(schema.gameScreenshots)).toEqual([]);
  expect(await db.select().from(schema.games)).toHaveLength(1);
});

test("the run records how many erotic screenshots the sweep removed", async () => {
  const withShots = {
    ...game(700, 1755000000),
    screenshots: [{ id: 10, image_id: "scdirty" }],
  };

  const result = await syncAll({
    db,
    pool,
    cache: stubCache(),
    igdb: stubIgdb([[withShots]], [700]),
  });

  expect(result).toMatchObject({ counts: { eroticScreenshotsRemoved: 1 } });

  const runs = await db.query.syncRuns.findMany();
  expect(runs[0]!.counts).toMatchObject({ eroticScreenshotsRemoved: 1 });
});

test("a failing sweep fails the run rather than reporting success", async () => {
  const igdb = {
    gamesPage: async () => [game(1, 1755000000)],
    eroticGameIds: async () => {
      throw new Error("IGDB returned 503 during sweep");
    },
  };

  const result = await syncAll({ db, pool, cache: stubCache(), igdb });

  expect(result).toMatchObject({ status: "failed", error: expect.stringContaining("sweep") });
});

test("a failing sweep does not bump search:ver", async () => {
  const cache = stubCache();
  const igdb = {
    gamesPage: async () => [game(1, 1755000000)],
    eroticGameIds: async () => {
      throw new Error("sweep exploded");
    },
  };

  await syncAll({ db, pool, cache, igdb });

  expect(cache.incremented).toEqual([]);
});
