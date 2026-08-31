import { sValidator } from "@hono/standard-validator";
import { backlogListQuerySchema, backlogUpsertSchema, gameIdPathSchema } from "@repo/contracts";
import {
  deleteBacklogEntry,
  gameExists,
  getBacklogStats,
  listBacklog,
  upsertBacklogEntry,
} from "@repo/db";
import { Hono } from "hono";

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

        if (!(await gameExists(deps.db, gameId))) {
          throw problems.create("NOT_FOUND", {
            detail: `Game ${gameId} is not in the mirror.`,
          });
        }

        const { entry, created } = await upsertBacklogEntry(deps.db, {
          userId: c.get("userId"),
          gameId,
          status,
          rating: rating ?? null,
        });

        return c.json(toBacklogEntry(entry), created ? 201 : 200);
      },
    )
    .delete("/:gameId", sValidator("param", gameIdPathSchema, onInvalid), async (c) => {
      const { gameId } = c.req.valid("param");

      const removed = await deleteBacklogEntry(deps.db, c.get("userId"), gameId);
      if (!removed) {
        throw problems.create("NOT_FOUND", {
          detail: `No backlog entry for game ${gameId}.`,
        });
      }

      return c.body(null, 204);
    });
}
