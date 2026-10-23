import { sValidator } from "@hono/standard-validator";
import {
  FREE_ACTIVE_SLOTS,
  backlogListQuerySchema,
  backlogUpsertSchema,
  gameIdPathSchema,
} from "@repo/contracts";
import { deleteBacklogEntry, getBacklogStats, listBacklog } from "@repo/db";
import { Hono } from "hono";

import { writeBacklogEntry } from "../backlog/entry-write.js";
import { sha1 } from "../cache-keys.js";
import { onInvalid, problems } from "../problems.js";
import { toBacklogEntry, toBacklogListItem } from "../serialize.js";
import type { AppDeps, AppEnv } from "../types.js";

export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;

  return header
    .split(",")
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === "*" || candidate === etag);
}

export function backlogRoutes(deps: AppDeps) {
  return new Hono<AppEnv>()
    .get("/", sValidator("query", backlogListQuerySchema, onInvalid), async (c) => {
      const { status, sort } = c.req.valid("query");

      const items = (await listBacklog(deps.db, { userId: c.get("userId"), status, sort })).map(
        toBacklogListItem,
      );

      const body = { items };
      const etag = `"${sha1(JSON.stringify(body))}"`;

      c.header("Cache-Control", "private, no-cache");
      c.header("ETag", etag);

      if (matchesIfNoneMatch(c.req.header("If-None-Match"), etag)) {
        return c.body(null, 304);
      }

      return c.json(body);
    })
    .get("/stats", async (c) => c.json(await getBacklogStats(deps.db, c.get("userId"))))
    .put(
      "/:gameId",
      sValidator("param", gameIdPathSchema, onInvalid),
      sValidator("json", backlogUpsertSchema, onInvalid),
      async (c) => {
        const { gameId } = c.req.valid("param");
        const { status, rating } = c.req.valid("json");

        const outcome = await writeBacklogEntry(
          deps.db,
          { userId: c.get("userId"), gameId, status, rating },
          new Date(),
        );

        if (outcome.kind === "unknown-game") {
          throw problems.create("GAME_NOT_FOUND", {
            detail: `Game ${gameId} is not in the mirror.`,
          });
        }

        if (outcome.kind === "capped") {
          const { activeCount, toFree } = outcome;

          throw problems.create("BACKLOG_CAP_REACHED", {
            detail:
              toFree > 1
                ? `A free backlog holds ${FREE_ACTIVE_SLOTS} unfinished games and you have ${activeCount}. Finish ${toFree} to free a spot, or subscribe for unlimited.`
                : `A free backlog holds ${FREE_ACTIVE_SLOTS} unfinished games. Finish one to free a spot, or subscribe for unlimited.`,
            extensions: { activeCount, limit: FREE_ACTIVE_SLOTS, toFree },
          });
        }

        return c.json(toBacklogEntry(outcome.entry), outcome.created ? 201 : 200);
      },
    )
    .delete("/:gameId", sValidator("param", gameIdPathSchema, onInvalid), async (c) => {
      const { gameId } = c.req.valid("param");

      const removed = await deleteBacklogEntry(deps.db, c.get("userId"), gameId);
      if (!removed) {
        throw problems.create("BACKLOG_ENTRY_NOT_FOUND", {
          detail: `No backlog entry for game ${gameId}.`,
        });
      }

      return c.body(null, 204);
    });
}
