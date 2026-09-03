import { getLogger } from "@logtape/logtape";
import { schema } from "@repo/db";
import { mapGameIds, PAGE_SIZE } from "@repo/igdb";
import { inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Db = NodePgDatabase<typeof schema>;

const log = getLogger(["worker", "sweep"]);

export interface SweepDeps {
  db: Db;
  igdb: { eroticGameIds(options: { afterId: number }): Promise<unknown[]> };
}

/**
 * Deletes mirrored screenshots for every erotic-tagged game, keyset-paging IGDB
 * the same way the main sync does.
 *
 * `mapGames` already drops these on the way in, so this is not the primary
 * defence — it is the backstop the incremental sync cannot be. The nightly run
 * only revisits games whose `updated_at` moved, so a game IGDB re-tagged as
 * erotic after we had already stored its screenshots would otherwise keep them
 * indefinitely. Asking IGDB which games are erotic *now* is what makes the
 * filter converge without a full resync.
 *
 * Deleting ids we do not mirror is a harmless no-op, and each page caps the
 * `IN` list at `PAGE_SIZE`, so the statement never grows unbounded.
 */
export async function sweepEroticScreenshots(deps: SweepDeps): Promise<number> {
  let afterId = 0;
  let deleted = 0;
  let pages = 0;

  for (;;) {
    const raw = await deps.igdb.eroticGameIds({ afterId });
    if (raw.length === 0) break;

    const ids = mapGameIds(raw);
    const removed = await deps.db
      .delete(schema.gameScreenshots)
      .where(inArray(schema.gameScreenshots.gameId, ids))
      .returning({ gameId: schema.gameScreenshots.gameId });

    deleted += removed.length;
    pages += 1;
    for (const id of ids) afterId = Math.max(afterId, id);

    if (raw.length < PAGE_SIZE) break;
  }

  log.debug("Swept {pages} erotic pages, {deleted} screenshots removed.", { pages, deleted });
  return deleted;
}
