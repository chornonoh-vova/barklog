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
  type ShareBasis,
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
  SEARCH_TTL_SECONDS,
  SEARCH_VERSION_KEY,
  searchKey,
  SIMILAR_TTL_SECONDS,
  similarKey,
  SOURCE_TTL_SECONDS,
  sourceKey,
} from "../cache-keys.js";
import { onInvalid, problems } from "../problems.js";
import { toBacklogEntry, toGameDetail, toGameSummary, type GameSummaryWire } from "../serialize.js";
import { EXTRACT_PROMPT_VERSION } from "../share/extract.js";
import { mergeCandidates, PER_GUESS_LIMIT } from "../share/identify.js";
import { SourceUnreadable } from "../share/meta.js";
import { normaliseShare } from "../share/normalise.js";
import { SourceGone, type SourceMeta } from "../share/oembed.js";
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

      const share = normaliseShare(url);
      if (share === null) {
        // Unreachable over HTTP: `shareIdentifySchema` already validated `url`
        // with the same `isShareableUrl` predicate `normaliseShare` uses.
        // Kept for type narrowing only — do not chase a test for this branch.
        throw problems.create("UNPROCESSABLE_SHARE", {
          detail: "That link cannot be opened. Barklog needs an https web address.",
        });
      }

      // The catch sits outside `withCache`, deliberately: a throw inside the
      // loader propagates uncached, so a transient failure is not pinned for
      // the TTL — the same property `/:id/similar` relies on.
      let meta: SourceMeta;
      try {
        meta = await withCache(deps.cache, sourceKey(share.shareId), SOURCE_TTL_SECONDS, () =>
          deps.share.fetchMeta(share),
        );
      } catch (error) {
        if (error instanceof SourceGone) {
          throw problems.create("NOT_FOUND", {
            detail: "That page is unavailable — it may be private or removed.",
          });
        }
        if (error instanceof SourceUnreadable) {
          throw problems.create("UNPROCESSABLE_SHARE", {
            detail: "We opened that link but could not find a title on it.",
          });
        }
        // Logged: `apiErrorHandler` never logs a `ProblemDetailsError`, so
        // without this a blocked address — the SSRF-probe signal now that
        // the host allowlist is gone — would fail as a silent 502.
        log.warn("Metadata fetch failed for {shareId}: {errorClass}", {
          shareId: share.shareId,
          errorClass: error instanceof Error ? error.constructor.name : typeof error,
        });
        // A fixed string: a 5xx must never carry the upstream message.
        throw problems.create("BAD_GATEWAY", {
          detail: "That link could not be read right now. Try again shortly.",
        });
      }

      // Keyed on `meta.shareId` — the post-redirect id — not the requested
      // one, so a short link and the page it resolves to share one cache entry.
      let guesses: string[];
      let basis: ShareBasis;
      try {
        const extraction = await withCache(
          deps.cache,
          extractKey(EXTRACT_PROMPT_VERSION, deps.share.model, meta.shareId),
          EXTRACT_TTL_SECONDS,
          () => deps.share.extractTitles(meta),
        );
        guesses = extraction.titles;
        basis = extraction.basis;
      } catch (error) {
        // Logged, not thrown: this is the one failure mode in the route that
        // never reaches `apiErrorHandler`, so without a log line an OpenAI
        // outage degrades every identify response in complete silence.
        log.warn("Extraction failed for {shareId}, falling back to the raw title: {message}", {
          shareId: meta.shareId,
          pageUrl: meta.pageUrl,
          message: error instanceof Error ? error.message : String(error),
        });
        // Fail soft: the raw title is a worse query than an extracted one, but
        // it is a far better answer than an error page.
        guesses = [meta.title];
        basis = "unavailable";
      }

      const version = await searchVersion();
      const results = await Promise.all(
        guesses.map((guess) => cachedSearch(guess, PER_GUESS_LIMIT, 0, version)),
      );

      const body: ShareIdentifyResponse = {
        source: {
          provider: meta.provider,
          shareId: meta.shareId,
          title: meta.title,
          author: meta.author,
          pageUrl: meta.pageUrl,
          // `?? null`: `withCache` casts rather than validates, so an entry
          // written before these fields existed arrives without them.
          thumbnailUrl: meta.thumbnailUrl ?? null,
          thumbnailWidth: meta.thumbnailWidth ?? null,
          thumbnailHeight: meta.thumbnailHeight ?? null,
        },
        basis,
        identified: basis !== "unavailable",
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
