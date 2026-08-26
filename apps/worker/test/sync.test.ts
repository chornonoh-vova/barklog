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

/** An IGDB stub that serves fixed pages and records the queries it was asked. */
function stubIgdb(pages: unknown[][]) {
  const calls: { since: Date | null; afterId: number }[] = [];
  let index = 0;
  return {
    calls,
    gamesPage: async (options: { since: Date | null; afterId: number }) => {
      calls.push(options);
      return pages[index++] ?? [];
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
  // Fewer than PAGE_SIZE rows means IGDB has nothing more to give, so asking
  // again would be a wasted round trip.
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

  // Rewound by the 60s overlap so nothing is lost at the second boundary.
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
  };
  const result = await syncAll({ db, pool, cache: stubCache(), igdb: broken });

  expect(result).toMatchObject({ status: "failed", error: expect.stringContaining("503") });

  const runs = await db.query.syncRuns.findMany();
  expect(runs.map((run) => run.status).sort()).toEqual(["failed", "success"]);

  // The next run still asks from the first run's watermark.
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
  };

  await syncAll({ db, pool, cache, igdb: broken });

  expect(cache.incremented).toEqual([]);
});

test("a run with nothing to do keeps the previous watermark rather than rewinding it", async () => {
  // Writing back the rewound value every night would drift the watermark
  // backwards by a minute per run.
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
  // The other termination path: a full page followed by nothing at all, rather
  // than by a short page.
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
  // One run, one id, on every record — nobody threaded it through a signature.
  expect(runIds.size).toBe(1);
  expect([...runIds][0]).toBeTruthy();
  expect(logs.records.length).toBeGreaterThan(0);

  await resetLogging();
});
