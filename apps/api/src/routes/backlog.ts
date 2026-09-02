import { sValidator } from "@hono/standard-validator";
import {
  FREE_ACTIVE_SLOTS,
  SLOT_CONSUMING_STATUSES,
  backlogListQuerySchema,
  backlogUpsertSchema,
  gameIdPathSchema,
  slotDelta,
} from "@repo/contracts";
import {
  countBacklogEntriesByStatus,
  deleteBacklogEntry,
  gameExists,
  getBacklogEntry,
  getBacklogStats,
  getSubscription,
  listBacklog,
  lockUser,
  upsertBacklogEntry,
} from "@repo/db";
import { Hono } from "hono";

import { sha1 } from "../cache-keys.js";
import { isPremium } from "../entitlement.js";
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

        const outcome = await deps.db.transaction(async (tx) => {
          await lockUser(tx, c.get("userId"));

          const existing = await getBacklogEntry(tx, c.get("userId"), gameId);
          const delta = slotDelta(existing?.status ?? null, status);

          // Only a slot-consuming transition can be blocked, so finishing or
          // re-rating a game costs no extra queries.
          if (delta > 0) {
            const subscription = await getSubscription(tx, c.get("userId"));

            if (!isPremium(subscription, new Date())) {
              const activeCount = await countBacklogEntriesByStatus(
                tx,
                c.get("userId"),
                SLOT_CONSUMING_STATUSES,
              );

              if (activeCount + delta > FREE_ACTIVE_SLOTS) {
                return { blocked: true as const, activeCount };
              }
            }
          }

          const { entry, created } = await upsertBacklogEntry(tx, {
            userId: c.get("userId"),
            gameId,
            status,
            rating: rating ?? null,
          });

          return { blocked: false as const, entry, created };
        });

        if (outcome.blocked) {
          throw problems.create("SUBSCRIPTION_REQUIRED", {
            detail: `A free backlog holds ${FREE_ACTIVE_SLOTS} unfinished games. Finish one to free a spot, or subscribe for unlimited.`,
            extensions: { activeCount: outcome.activeCount, limit: FREE_ACTIVE_SLOTS },
          });
        }

        return c.json(toBacklogEntry(outcome.entry), outcome.created ? 201 : 200);
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
