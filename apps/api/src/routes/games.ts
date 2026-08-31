import { sValidator } from "@hono/standard-validator";
import { withCache } from "@repo/cache";
import {
  gameFeedQuerySchema,
  gameIdParamSchema,
  searchQuerySchema,
  similarQuerySchema,
  type GameFeed,
} from "@repo/contracts";
import {
  gameExists,
  getBacklogEntry,
  getGameDetail,
  popularGames,
  recentGames,
  searchGames,
  similarGames,
  upcomingGames,
  type GameSummary,
} from "@repo/db";
import { Hono } from "hono";

import {
  EMPTY_SEARCH_TTL_SECONDS,
  FEED_TTL_SECONDS,
  feedKey,
  normaliseQuery,
  SEARCH_TTL_SECONDS,
  SEARCH_VERSION_KEY,
  searchKey,
  SIMILAR_TTL_SECONDS,
  similarKey,
} from "../cache-keys.js";
import { onInvalid, problems } from "../problems.js";
import { toBacklogEntry, toGameDetail, toGameSummary, type GameSummaryWire } from "../serialize.js";
import type { AppDeps, AppEnv } from "../types.js";

const FEED_CACHE_CONTROL = "private, max-age=300";

export function gamesRoutes(deps: AppDeps) {
  const searchVersion = async (): Promise<number> =>
    (await deps.cache.get<number>(SEARCH_VERSION_KEY)) ?? 0;

  const notInMirror = (id: number) =>
    problems.create("NOT_FOUND", { detail: `Game ${id} is not in the mirror.` });

  /** The three feeds differ only in the query they run. */
  const feed = async (
    name: GameFeed,
    limit: number,
    run: (now: Date) => Promise<GameSummary[]>,
  ): Promise<GameSummaryWire[]> => {
    const now = new Date();

    return withCache<GameSummaryWire[]>(
      deps.cache,
      feedKey(name, await searchVersion(), limit, now),
      FEED_TTL_SECONDS,
      async () => (await run(now)).map(toGameSummary),
    );
  };

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
      .get("/popular", sValidator("query", gameFeedQuerySchema, onInvalid), async (c) => {
        const { limit } = c.req.valid("query");
        const items = await feed("popular", limit, () => popularGames(deps.db, { limit }));

        c.header("Cache-Control", FEED_CACHE_CONTROL);
        return c.json({ items });
      })
      .get("/upcoming", sValidator("query", gameFeedQuerySchema, onInvalid), async (c) => {
        const { limit } = c.req.valid("query");
        const items = await feed("upcoming", limit, (now) =>
          upcomingGames(deps.db, { limit, now }),
        );

        c.header("Cache-Control", FEED_CACHE_CONTROL);
        return c.json({ items });
      })
      .get("/recent", sValidator("query", gameFeedQuerySchema, onInvalid), async (c) => {
        const { limit } = c.req.valid("query");
        const items = await feed("recent", limit, (now) => recentGames(deps.db, { limit, now }));

        c.header("Cache-Control", FEED_CACHE_CONTROL);
        return c.json({ items });
      })
      .get(
        "/:id/similar",
        sValidator("param", gameIdParamSchema, onInvalid),
        sValidator("query", similarQuerySchema, onInvalid),
        async (c) => {
          const { id } = c.req.valid("param");
          const { limit } = c.req.valid("query");

          const items = await withCache<GameSummaryWire[]>(
            deps.cache,
            similarKey(await searchVersion(), id, limit),
            SIMILAR_TTL_SECONDS,
            async () => {
              // Inside the loader, not before it: a throw propagates uncached,
              // so a missing game does not get a 404 pinned for an hour, and a
              // cache hit pays nothing for the check.
              if (!(await gameExists(deps.db, id))) throw notInMirror(id);

              return (await similarGames(deps.db, { gameId: id, limit })).map(toGameSummary);
            },
          );

          c.header("Cache-Control", FEED_CACHE_CONTROL);
          return c.json({ items });
        },
      )
      // Registered last so the static paths above are never shadowed.
      .get("/:id", sValidator("param", gameIdParamSchema, onInvalid), async (c) => {
        const { id } = c.req.valid("param");

        const game = await getGameDetail(deps.db, id);
        if (!game) throw notInMirror(id);

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
