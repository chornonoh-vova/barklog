import { sValidator } from "@hono/standard-validator";
import { withCache } from "@repo/cache";
import { gameIdParamSchema, popularQuerySchema, searchQuerySchema } from "@repo/contracts";
import { getBacklogEntry, getGameDetail, popularGames, searchGames } from "@repo/db";
import { Hono } from "hono";

import {
  EMPTY_SEARCH_TTL_SECONDS,
  normaliseQuery,
  POPULAR_TTL_SECONDS,
  popularKey,
  SEARCH_TTL_SECONDS,
  SEARCH_VERSION_KEY,
  searchKey,
} from "../cache-keys.js";
import { onInvalid, problems } from "../problems.js";
import { toBacklogEntry, toGameDetail, toGameSummary, type GameSummaryWire } from "../serialize.js";
import type { AppDeps, AppEnv } from "../types.js";

export function gamesRoutes(deps: AppDeps) {
  const searchVersion = async (): Promise<number> =>
    (await deps.cache.get<number>(SEARCH_VERSION_KEY)) ?? 0;

  return (
    new Hono<AppEnv>()
      .get("/search", sValidator("query", searchQuerySchema, onInvalid), async (c) => {
        const { q, limit, offset } = c.req.valid("query");
        const query = normaliseQuery(q);
        const version = await searchVersion();

        const items = await withCache<GameSummaryWire[]>(
          deps.cache,
          searchKey(version, query, limit, offset),
          (value) => (value.length === 0 ? EMPTY_SEARCH_TTL_SECONDS : SEARCH_TTL_SECONDS),
          async () => (await searchGames(deps.db, { query, limit, offset })).map(toGameSummary),
        );

        c.header("Cache-Control", "private, max-age=60");
        return c.json({ items });
      })
      .get("/popular", sValidator("query", popularQuerySchema, onInvalid), async (c) => {
        const { limit } = c.req.valid("query");
        const version = await searchVersion();

        const items = await withCache<GameSummaryWire[]>(
          deps.cache,
          popularKey(version, limit),
          POPULAR_TTL_SECONDS,
          async () => (await popularGames(deps.db, { limit })).map(toGameSummary),
        );

        c.header("Cache-Control", "private, max-age=300");
        return c.json({ items });
      })
      // Registered last so the two static paths above are never shadowed.
      .get("/:id", sValidator("param", gameIdParamSchema, onInvalid), async (c) => {
        const { id } = c.req.valid("param");

        const game = await getGameDetail(deps.db, id);
        if (!game) {
          throw problems.create("NOT_FOUND", { detail: `Game ${id} is not in the mirror.` });
        }

        // Embedding the caller's entry is what gives the game screen the right
        // button state in one request. It also makes the response user-varying,
        // which is why it must never enter a shared cache (spec §8).
        const entry = await getBacklogEntry(deps.db, c.get("userId"), id);

        // `no-cache`, not `max-age`: the response embeds the caller's own
        // backlogEntry, so it must be revalidated on every use rather than
        // reused from the client's cache. A `max-age` here would let the
        // client's own cache show the pre-add button state after the user
        // adds the game and reopens the screen within the window — defeating
        // the reason the entry is embedded in the first place (spec §8).
        c.header("Cache-Control", "private, no-cache");
        return c.json({
          ...toGameDetail(game),
          backlogEntry: entry === null ? null : toBacklogEntry(entry),
        });
      })
  );
}
