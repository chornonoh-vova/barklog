import { sValidator } from "@hono/standard-validator";
import { getLogger } from "@logtape/logtape";
import { withCache } from "@repo/cache";
import {
  gameFeedQuerySchema,
  gameIdParamSchema,
  searchQuerySchema,
  shareIdentifySchema,
  similarQuerySchema,
  type GameFeed,
  type ShareIdentifyResponse,
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
  EXTRACT_TTL_SECONDS,
  extractKey,
  FEED_TTL_SECONDS,
  feedKey,
  normaliseQuery,
  OEMBED_TTL_SECONDS,
  oembedKey,
  SEARCH_TTL_SECONDS,
  SEARCH_VERSION_KEY,
  searchKey,
  SIMILAR_TTL_SECONDS,
  similarKey,
} from "../cache-keys.js";
import { onInvalid, problems } from "../problems.js";
import { toBacklogEntry, toGameDetail, toGameSummary, type GameSummaryWire } from "../serialize.js";
import { parseShareUrl, type Canonical } from "../share/canonicalise.js";
import { EXTRACT_PROMPT_VERSION } from "../share/extract.js";
import { mergeCandidates, PER_GUESS_LIMIT } from "../share/identify.js";
import { VideoGone, type VideoMeta } from "../share/oembed.js";
import type { AppDeps, AppEnv } from "../types.js";

const FEED_CACHE_CONTROL = "private, max-age=300";
const log = getLogger(["api", "identify"]);

export function gamesRoutes(deps: AppDeps) {
  const searchVersion = async (): Promise<number> =>
    (await deps.cache.get<number>(SEARCH_VERSION_KEY)) ?? 0;

  const notInMirror = (id: number) =>
    problems.create("NOT_FOUND", { detail: `Game ${id} is not in the mirror.` });

  const cachedSearch = async (
    query: string,
    limit: number,
    offset: number,
    version: number,
  ): Promise<GameSummaryWire[]> => {
    const normalised = normaliseQuery(query);

    return withCache<GameSummaryWire[]>(
      deps.cache,
      searchKey(version, normalised, limit, offset),
      (value) => (value.length === 0 ? EMPTY_SEARCH_TTL_SECONDS : SEARCH_TTL_SECONDS),
      async () =>
        (await searchGames(deps.db, { query: normalised, limit, offset })).map(toGameSummary),
    );
  };

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

  return new Hono<AppEnv>()
    .get("/search", sValidator("query", searchQuerySchema, onInvalid), async (c) => {
      const { q, limit, offset } = c.req.valid("query");
      const items = await cachedSearch(q, limit, offset, await searchVersion());

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
      const items = await feed("upcoming", limit, (now) => upcomingGames(deps.db, { limit, now }));

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
            // Inside the loader: a throw propagates uncached, so a 404 is
            // not pinned for a full TTL.
            if (!(await gameExists(deps.db, id))) throw notInMirror(id);

            return (await similarGames(deps.db, { gameId: id, limit })).map(toGameSummary);
          },
        );

        c.header("Cache-Control", FEED_CACHE_CONTROL);
        return c.json({ items });
      },
    )
    .post("/identify", sValidator("json", shareIdentifySchema, onInvalid), async (c) => {
      const { url, limit } = c.req.valid("json");

      // Pure first: a short link is the only shape that needs a network hop,
      // so an ordinary link never pays for one.
      let canonical: Canonical = parseShareUrl(url);
      if (canonical.kind === "shortLink") {
        canonical = await deps.share.resolveShortLink(canonical.url);
      }

      if (canonical.kind !== "video") {
        // A recognised host whose path is not a video page. The schema cannot
        // catch this — it validates the host, not the route within it.
        throw problems.create("UNPROCESSABLE_SHARE", {
          detail: "That link is not a YouTube or TikTok video page.",
        });
      }

      const { ref } = canonical;

      let meta: VideoMeta;
      try {
        meta = await withCache(
          deps.cache,
          oembedKey(ref.provider, ref.videoId),
          OEMBED_TTL_SECONDS,
          () => deps.share.fetchMeta(ref),
        );
      } catch (error) {
        if (error instanceof VideoGone) {
          throw problems.create("NOT_FOUND", {
            detail: "That video is unavailable — it may be private or removed.",
          });
        }
        // A fixed string: a 5xx must never carry the upstream message.
        throw problems.create("BAD_GATEWAY", {
          detail: "The video could not be read right now. Try again shortly.",
        });
      }

      // The catch sits outside `withCache`, deliberately. A throw inside the
      // loader propagates uncached — the same property `/:id/similar` relies on
      // — so one transient failure cannot pin a degraded answer for 30 days.
      let guesses: string[];
      let identified: boolean;
      try {
        guesses = await withCache(
          deps.cache,
          extractKey(EXTRACT_PROMPT_VERSION, deps.share.model, ref.provider, ref.videoId),
          EXTRACT_TTL_SECONDS,
          () => deps.share.extractTitles(meta),
        );
        identified = true;
      } catch (error) {
        // Logged, not thrown: this is the one failure mode in the route that
        // never reaches `apiErrorHandler`, so without a log line an Anthropic
        // outage degrades every identify response in complete silence.
        log.warn(
          "Extraction failed for {provider}:{videoId}, falling back to the raw title: {message}",
          {
            provider: ref.provider,
            videoId: ref.videoId,
            message: error instanceof Error ? error.message : String(error),
          },
        );
        // Fail soft: the raw title is a worse query than an extracted one, but
        // it is a far better answer than an error page.
        guesses = [meta.title];
        identified = false;
      }

      const version = await searchVersion();
      const results = await Promise.all(
        guesses.map((guess) => cachedSearch(guess, PER_GUESS_LIMIT, 0, version)),
      );

      const body: ShareIdentifyResponse = {
        source: {
          provider: ref.provider,
          videoId: ref.videoId,
          title: meta.title,
          author: meta.author,
        },
        identified,
        guesses,
        items: mergeCandidates(results, limit),
      };

      // `no-store`: the body is derived from a link the user just shared, and
      // the cache that matters is the server-side one.
      c.header("Cache-Control", "private, no-store");
      return c.json(body);
    })
    .get("/:id", sValidator("param", gameIdParamSchema, onInvalid), async (c) => {
      const { id } = c.req.valid("param");

      const game = await getGameDetail(deps.db, id);
      if (!game) throw notInMirror(id);

      const entry = await getBacklogEntry(deps.db, c.get("userId"), id);

      // `no-cache`, not `max-age`: the body embeds the caller's own entry, so a
      // reused response would show a stale button state after an add.
      c.header("Cache-Control", "private, no-cache");
      return c.json({
        ...toGameDetail(game),
        backlogEntry: entry === null ? null : toBacklogEntry(entry),
      });
    });
}
