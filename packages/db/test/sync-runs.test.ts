import { afterAll, beforeEach, expect, inject, test } from "vitest";

import { createDb } from "../src/client.js";
import { failRun, finishRun, getWatermark, startRun } from "../src/queries/sync-runs.js";
import { truncateAll } from "../src/testing.js";

const { db, close } = createDb(inject("databaseUrl"));

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await close();
});

test("no successful run yet means no watermark, which triggers a full seed", async () => {
  expect(await getWatermark(db)).toBeNull();
});

test("a successful run sets a watermark, rewound by the 60s overlap", async () => {
  const id = await startRun(db);
  const watermark = new Date("2026-08-20T00:00:00Z");
  await finishRun(db, id, { watermark, counts: { games: 12 } });

  const result = await getWatermark(db);

  expect(result).toEqual(new Date("2026-08-19T23:59:00Z"));
});

test("a failed run does not advance the watermark, so the range is retried", async () => {
  const first = await startRun(db);
  await finishRun(db, first, {
    watermark: new Date("2026-08-20T00:00:00Z"),
    counts: { games: 12 },
  });

  const second = await startRun(db);
  await failRun(db, second, "IGDB returned 503");

  // Still the first run's watermark: tomorrow re-fetches the same range.
  expect(await getWatermark(db)).toEqual(new Date("2026-08-19T23:59:00Z"));
});

test("the most recent successful run wins", async () => {
  const older = await startRun(db);
  await finishRun(db, older, {
    watermark: new Date("2026-08-18T00:00:00Z"),
    counts: {},
  });
  const newer = await startRun(db);
  await finishRun(db, newer, {
    watermark: new Date("2026-08-20T00:00:00Z"),
    counts: {},
  });

  expect(await getWatermark(db)).toEqual(new Date("2026-08-19T23:59:00Z"));
});

test("failRun records the error and marks the run failed", async () => {
  const id = await startRun(db);
  await failRun(db, id, "boom");

  const rows = await db.query.syncRuns.findMany();
  expect(rows[0]!.status).toBe("failed");
  expect(rows[0]!.error).toBe("boom");
  expect(rows[0]!.finishedAt).not.toBeNull();
});
