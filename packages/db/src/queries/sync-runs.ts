import { desc, eq } from "drizzle-orm";

import type { Queryable } from "../client.js";
import { syncRuns } from "../schema/sync.js";

/** Overlap the watermark: IGDB's `updated_at` is second-resolution, so an
 * exact boundary can drop rows. */
export const WATERMARK_OVERLAP_MS = 60_000;

export async function startRun(db: Queryable): Promise<string> {
  const [row] = await db.insert(syncRuns).values({}).returning({ id: syncRuns.id });
  return row!.id;
}

export async function finishRun(
  db: Queryable,
  id: string,
  result: { watermark: Date; counts: Record<string, number> },
): Promise<void> {
  await db
    .update(syncRuns)
    .set({
      status: "success",
      finishedAt: new Date(),
      watermark: result.watermark,
      counts: result.counts,
    })
    .where(eq(syncRuns.id, id));
}

export async function failRun(db: Queryable, id: string, error: string): Promise<void> {
  await db
    .update(syncRuns)
    .set({ status: "failed", finishedAt: new Date(), error })
    .where(eq(syncRuns.id, id));
}

export async function getWatermark(db: Queryable): Promise<Date | null> {
  const [row] = await db
    .select({ watermark: syncRuns.watermark })
    .from(syncRuns)
    .where(eq(syncRuns.status, "success"))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);

  if (!row?.watermark) return null;

  return new Date(row.watermark.getTime() - WATERMARK_OVERLAP_MS);
}

export interface SyncRunSummary {
  id: string;
  status: "running" | "success" | "failed";
  startedAt: Date;
  finishedAt: Date | null;
  watermark: Date | null;
  counts: Record<string, number>;
  error: string | null;
}

export async function getLastRun(db: Queryable): Promise<SyncRunSummary | null> {
  const rows = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1);

  return rows[0] ?? null;
}
