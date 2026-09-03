import { getLogger, withContext } from "@logtape/logtape";
import { SEARCH_VERSION_KEY } from "@repo/cache";
import {
  failRun,
  finishRun,
  getWatermark,
  startRun,
  WATERMARK_OVERLAP_MS,
  type schema,
} from "@repo/db";
import { mapGames, PAGE_SIZE } from "@repo/igdb";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";

import { persistPage } from "./persist.js";
import { sweepEroticScreenshots } from "./sweep.js";

type Db = NodePgDatabase<typeof schema>;

const log = getLogger(["worker", "sync"]);

export const SYNC_LOCK_KEY = 8823001;

export interface SyncDeps {
  db: Db;
  pool: pg.Pool;
  cache: { incr(key: string): Promise<number | null> };
  igdb: {
    gamesPage(options: { since: Date | null; afterId: number }): Promise<unknown[]>;
    eroticGameIds(options: { afterId: number }): Promise<unknown[]>;
  };
}

export type SyncResult =
  | { status: "skipped" }
  | { status: "success"; counts: Record<string, number>; watermark: Date }
  | { status: "failed"; error: string };

export async function syncAll(
  deps: SyncDeps,
  options: { full?: boolean } = {},
): Promise<SyncResult> {
  // The advisory lock is session-scoped, so it needs one dedicated connection.
  const lockConnection = await deps.pool.connect();
  const locked = await lockConnection.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [SYNC_LOCK_KEY],
  );

  if (!locked.rows[0]?.locked) {
    lockConnection.release();
    log.info("Another sync holds the lock; skipping.");
    return { status: "skipped" };
  }

  const runId = await startRun(deps.db);

  return withContext({ runId }, async () => {
    try {
      const since = options.full ? null : await getWatermark(deps.db);
      log.info("Starting {mode} sync.", { mode: since ? "incremental" : "full", since });

      const counts: Record<string, number> = { games: 0, pages: 0 };
      let afterId = 0;
      let newestUpdatedAt: Date | null = null;

      for (;;) {
        const raw = await deps.igdb.gamesPage({ since, afterId });
        if (raw.length === 0) break;

        const page = mapGames(raw);
        await persistPage(deps.db, page);

        counts.games! += page.games.length;
        counts.pages! += 1;

        for (const game of page.games) {
          afterId = Math.max(afterId, game.id);
          if (!newestUpdatedAt || game.igdbUpdatedAt > newestUpdatedAt) {
            newestUpdatedAt = game.igdbUpdatedAt;
          }
        }

        log.debug("Page {page}: {games} games.", { page: counts.pages, games: page.games.length });
        if (raw.length < PAGE_SIZE) break;
      }

      // After the pages, and inside the try: a sweep that fails must fail the
      // run rather than leave screenshots served with a success recorded.
      counts.eroticScreenshotsRemoved = await sweepEroticScreenshots(deps);

      // `since` is the stored watermark minus the overlap; add it back, or the
      // watermark drifts backwards on every empty run.
      const watermark =
        newestUpdatedAt ?? (since ? new Date(since.getTime() + WATERMARK_OVERLAP_MS) : new Date(0));

      await finishRun(deps.db, runId, { watermark, counts });

      // Only after a successful run: this orphans every cached search at once.
      await deps.cache.incr(SEARCH_VERSION_KEY);

      log.info("Sync complete: {games} games across {pages} pages.", {
        games: counts.games,
        pages: counts.pages,
        counts,
        watermark,
      });
      return { status: "success", counts, watermark };
    } catch (error) {
      const message = (error as Error).message;
      await failRun(deps.db, runId, message);
      log.error("Sync failed: {message}", { message });
      return { status: "failed", error: message };
    } finally {
      await lockConnection.query("SELECT pg_advisory_unlock($1)", [SYNC_LOCK_KEY]);
      lockConnection.release();
    }
  });
}
