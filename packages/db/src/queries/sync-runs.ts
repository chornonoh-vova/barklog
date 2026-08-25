import { desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "../schema/index.js";
import { syncRuns } from "../schema/sync.js";

type Db = NodePgDatabase<typeof schema>;

/**
 * Rewind the watermark by a minute before querying IGDB. IGDB's `updated_at`
 * has second resolution and rows can land either side of a boundary, so a small
 * overlap costs a few redundant upserts and prevents a silent gap.
 */
export const WATERMARK_OVERLAP_MS = 60_000;

export async function startRun(db: Db): Promise<string> {
  const [row] = await db.insert(syncRuns).values({}).returning({ id: syncRuns.id });
  return row!.id;
}

export async function finishRun(
  db: Db,
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

export async function failRun(db: Db, id: string, error: string): Promise<void> {
  await db
    .update(syncRuns)
    .set({ status: "failed", finishedAt: new Date(), error })
    .where(eq(syncRuns.id, id));
}

/**
 * The watermark of the most recent successful run, minus the overlap. `null`
 * means no successful run has ever completed, which the caller treats as a
 * request for a full seed. A failed run never advances this, so a failed range
 * is simply retried on the next run.
 */
export async function getWatermark(db: Db): Promise<Date | null> {
  const [row] = await db
    .select({ watermark: syncRuns.watermark })
    .from(syncRuns)
    .where(eq(syncRuns.status, "success"))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);

  if (!row?.watermark) return null;

  return new Date(row.watermark.getTime() - WATERMARK_OVERLAP_MS);
}
