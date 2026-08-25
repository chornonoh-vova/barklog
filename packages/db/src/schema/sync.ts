import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const syncRunStatus = pgEnum("sync_run_status", ["running", "success", "failed"]);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: syncRunStatus("status").notNull().default("running"),
    watermark: timestamp("watermark", { withTimezone: true }),
    counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
    error: text("error"),
  },
  (t) => [
    index("sync_runs_success_idx")
      .on(sql`${t.finishedAt} DESC`)
      .where(sql`${t.status} = 'success'`),
  ],
);
