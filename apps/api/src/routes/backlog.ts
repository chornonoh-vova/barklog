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

/** `If-None-Match` is a list, and `*` matches any current representation. */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) return false;

  return header
    .split(",")
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === "*" || candidate === etag);
}

export function backlogRoutes(deps: AppDeps) {
  return (
    new Hono<AppEnv>()
      /**
       * The caller's whole collection. No pagination: a personal backlog runs to
       * hundreds of rows, and the soft cap in the query keeps it bounded.
       *
       * Conditional, because the collection changes rarely and a user opening the
       * app five times a day should get four empty responses.
       */
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
      // Before `/:gameId` would ever be consulted, and a distinct method anyway.
      .get("/stats", async (c) => c.json(await getBacklogStats(deps.db, c.get("userId"))))
      /**
       * `PUT` only. An entry is two fields and the client always holds both, so a
       * full replace is always expressible — which removes the
       * 409-already-exists path entirely and makes an offline retry harmless.
       */
      .put(
        "/:gameId",
        sValidator("param", gameIdPathSchema, onInvalid),
        sValidator("json", backlogUpsertSchema, onInvalid),
        async (c) => {
          const { gameId } = c.req.valid("param");
          const { status, rating } = c.req.valid("json");

          // An entry for a game we have not mirrored cannot satisfy the foreign
          // key, so this is a 404 rather than a constraint violation.
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
      })
  );
}
