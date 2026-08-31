# Similar Games — Design

**Date:** 2026-08-31
**Status:** Approved for planning
**Depends on:** `2026-08-25-barklog-mirror-foundation.md` §7 (IGDB fields and the
mirror tables), `2026-08-25-barklog-api-design.md` §8 and §10 (caching), and
`2026-08-27-barklog-mobile-design.md` §6 (the game detail screen)

## 1. Purpose

The game detail screen is a dead end. It tells you everything about one game and
offers no way onward except the back button. Someone browsing Explore, opening a
game, and deciding it is not for them has to reverse out and start again.

A row of similar games at the foot of the screen turns it into a place you can
travel through rather than into.

### Goals

- Suggestions come from IGDB's own `similar_games`, the same source every other
  field on the screen comes from.
- Served entirely from the mirror. No IGDB call on a user-facing path.
- Cacheable in Valkey and shared across users, unlike the detail response it
  sits beside.
- Degrades to nothing. A game with no suggestions, a failed request, and a
  request still in flight all render identically: no section at all.
- Safe to deploy before any data exists, so the migration and the backfill need
  no coordination.

### Non-goals

Computed similarity from genre or platform overlap (see §11). A "more from this
developer" or "more in this series" shelf. Personalising suggestions against the
caller's backlog. Pagination — the list is at most a dozen games. Android.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Source | IGDB `similar_games`, mirrored | Confirmed live at field 34 of IGDB's own `Game` proto and not deprecated — only `follows` carries a `[deprecated = true]` marker. Genuinely cross-genre in a way overlap scoring cannot fake, and there is no ranking heuristic to tune or defend. |
| Ordering | Re-rank on read by `total_rating_count DESC, id ASC` | IGDB's array order is undocumented, so preserving it would be cargo-culting. This is the same total order every other feed uses, so a `LIMIT` cannot produce an unstable list. Costs no `position` column. |
| Target foreign key | None | The sync walks ids ascending, so a low-id page routinely names a game not yet inserted. An FK would reject the row and fail the page. Same reasoning, and the same test, as `games.parentGameId`. |
| Dangling ids | Dropped by `innerJoin` on read | No `EXISTS` clause, no cleanup job, and self-healing as the mirror fills in. |
| Filtering | `SEARCHABLE_GAME_TYPE_IDS` only | Keeps DLC, mods, bundles and episodes out. Games without cover art are kept: `components/cover.tsx` already draws a `gamecontroller` placeholder, so dropping them would shrink a short list for no visual gain. The release feeds filter on cover art for a different reason — placeholder rows padding a release week. |
| Transport | A separate `GET /api/games/:id/similar` | `GET /api/games/:id` is `private, no-cache` because it embeds the caller's `backlogEntry`, so it can never enter the shared cache. A similar-games list is identical for every user. Folding it in would recompute it on every detail open, forever. |
| Response type | The existing `GameListResponse` | No new wire type, and `GameDetailWire` is untouched. |
| Backlog state on tiles | Absent | Including it would make the response user-varying and throw away the caching. Explore's tiles do not show it either. |
| Unknown game id | `404`, checked inside the cache loader | An empty list would be a lie about a game that does not exist. `PUT /api/backlog/:gameId` already guards this way with the same `gameExists` helper. Inside the loader because a throw propagates uncached, so a cache hit pays nothing for the check. |
| Layout | One horizontal row of `GameTile`s, limit 12 | Reads as a subsection of a detail screen rather than a browse surface. A two-row grid would double the section's height on an already-long screen. |
| Section title | "Similar Games" | Matches the neutral register of the detail rows above it ("Released", "Genres", "Platforms"). |
| In-tab navigation | Base path passed in as a prop | See §7. |

## 3. Data flow

```
IGDB `similar_games` (bare ids, unexpanded)
  → packages/igdb        GAME_FIELDS, igdbGameSchema, mapGames
  → apps/worker          persistPage: delete-then-insert, scoped by page
  → game_similar         (game_id, similar_game_id) — soft ref on the target
  → packages/db          similarGames(): innerJoin games, filter, re-rank
  → apps/api             GET /api/games/:id/similar, Valkey-cached 1h
  → apps/mobile          useSimilarGames → <SimilarGames> → GameTile row
```

## 4. The IGDB layer

`GAME_FIELDS` in `packages/igdb/src/games-query.ts` gains `"similar_games"`,
placed immediately after `parent_game` — both are soft references to other
games. The nightly contract test then guards it: IGDB answers `400` for a
deprecated or removed field, and the client surfaces that without retrying, so
the build fails rather than the data silently emptying.

`igdbGameSchema` gains `similar_games: v.optional(v.array(int))`. Requested
unexpanded, IGDB returns bare ids, exactly as `parent_game` returns a number.

`MappedPage` gains `gameSimilar: { gameId: number; similarGameId: number }[]`.
The mapper needs two guards the other join tables do without, because this list
is algorithmically generated rather than curated:

- **Deduplicated** by `${gameId}:${similarId}`. `gameGenres` and `gamePlatforms`
  rely on IGDB never repeating an entry; that is a safe bet for a curated set of
  a dozen genres and a bad one here. A duplicate inside one page would be a
  unique violation that fails the whole transaction.
- **Self-references dropped** (`similarId !== game.id`), so no game is ever
  similar to itself.

Payload cost is 500 games times roughly a dozen ids per page. Negligible against
the screenshot and company expansions already in the query.

## 5. The mirror table

Migration `0004`:

```sql
CREATE TABLE "game_similar" (
  "game_id"         integer NOT NULL REFERENCES "games"("id") ON DELETE cascade,
  "similar_game_id" integer NOT NULL,
  PRIMARY KEY ("game_id", "similar_game_id")
);
```

`similar_game_id` carries **no foreign key**, for the reason in §2. It gets the
same kind of test `parent_game_id` has in `mirror-schema.test.ts`: a row naming a
nonexistent game inserts successfully.

**No secondary index.** The only read is `WHERE game_id = $1`, which the primary
key's leading column already serves.

`truncateAll` in `packages/db/src/testing.ts` gains `game_similar` on the
join-table line. `ON DELETE cascade` from `games` would cover it, but that list
is explicit and an omission there surfaces much later as cross-test bleed.

`persistPage` gains one `delete(...).where(inArray(gameId, gameIds))` and one
guarded insert, alongside the four already there. Replaying a page stays a no-op,
which is the property the sync's failure model depends on, and a suggestion IGDB
has dropped disappears because the delete is scoped to the page's games.

## 6. The query and the route

```ts
export async function similarGames(
  db: Db,
  options: { gameId: number; limit: number },
): Promise<GameSummary[]> {
  return db
    .select(GAME_SUMMARY_COLUMNS)
    .from(gameSimilar)
    .innerJoin(games, eq(gameSimilar.similarGameId, games.id))
    .where(and(eq(gameSimilar.gameId, options.gameId), searchableType))
    .orderBy(desc(games.totalRatingCount), asc(games.id))
    .limit(options.limit);
}
```

The relation is directional and read forward only: A listing B does not make B
list A. This is IGDB's shape, not an accident of storage.

Contracts gain a default but no new cap:

```ts
export const SIMILAR_LIMIT_DEFAULT = 12;
export const similarQuerySchema = v.object({
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SIMILAR_LIMIT_DEFAULT),
});
```

12 is what IGDB actually supplies; the cap is the shared `SEARCH_LIMIT_MAX`
rather than a third limit constant. The path param reuses `gameIdParamSchema`.

Cache keys:

```ts
export const SIMILAR_TTL_SECONDS = 3600;
export function similarKey(version: number, gameId: number, limit: number): string {
  return `similar:v${version}:${gameId}:${limit}`;
}
```

Version-prefixed, so the `incr(SEARCH_VERSION_KEY)` the worker already performs
at the end of a sync sweeps these too. No day bucketing — unlike the release
feeds, nothing here moves at midnight. No `sha1` — no free text in the key.

The route is registered **before** the `/:id` catch-all. Two path segments cannot
actually collide with one, but it keeps that route's "registered last so the
static paths above are never shadowed" comment honest.

`Cache-Control` is `FEED_CACHE_CONTROL` (`private, max-age=300`), the same
directive the three feeds carry: shareable content, but scoped `private` because
every route sits behind a session token.

## 7. The mobile section, and the navigation problem

`GameShelf` needs no refactor. A single row needs neither `toColumns` nor the
two-row column machinery, so `features/game/similar-games.tsx` reuses `GameTile`
and `summarySubtitle` directly, borrowing `GameShelf`'s title style for
consistency.

```tsx
const items = similar.data?.items ?? [];
if (items.length === 0) return null;
```

In flight, empty and failed all render nothing. That is Explore's rule — "a
shelf that fails is simply not drawn" — applied to a section, and it is what
makes the feature safe to ship before any data exists.

The query key is `["games", "similar", id, limit]`, deliberately **not** nested
under `keys.games.detail(id)`: a backlog write invalidates that key, and adding a
game to your backlog does not change what is similar to it.

### Navigation

The detail screen currently pushes nowhere, and it is triplicated across three
tabs precisely so a push stays inside its tab. It therefore cannot hardcode a
prefix.

Expo Router 57 does support relative hrefs (`../456`), but the v57 documentation
shows no `relativeToDirectory` option and route-relative resolution is subtle
enough that the feature should not rest on it. So the base path is passed in:

```tsx
// app/(tabs)/explore/game/[id].tsx
export default function ExploreGameDetail() {
  return <GameDetailScreen basePath="/explore/game" />;
}
```

`(home)` passes `"/game"`, `search` passes `"/search/game"`. Three one-line
re-exports become three four-line components. Explicit, no router-semantics
risk, and a pure string.

Rejected alternative: a `useSegments()`-based hook deriving the tab from the
segment array, which would index into a shape that depends on the route-group
layout.

Pushing detail onto detail is unbounded. iOS handles it and back always works,
so it is allowed, as the App Store allows it.

## 8. Files

**Changed**

```
packages/igdb/src/games-query.ts          +1 field
packages/igdb/src/schemas.ts              +1 optional field
packages/igdb/src/map.ts                  +MappedPage.gameSimilar, dedup, self-filter
packages/db/src/schema/mirror.ts          +gameSimilar table
packages/db/src/testing.ts                +game_similar in truncateAll
packages/db/src/queries/games.ts          +similarGames()
packages/db/drizzle/0004_*.sql            generated
packages/contracts/src/games.ts           +SIMILAR_LIMIT_DEFAULT, similarQuerySchema
apps/worker/src/persist.ts                +delete + insert
apps/api/src/cache-keys.ts                +SIMILAR_TTL_SECONDS, similarKey()
apps/api/src/routes/games.ts              +GET /:id/similar
apps/mobile/src/api/endpoints.ts          +similarGames()
apps/mobile/src/api/keys.ts               +games.similar()
apps/mobile/src/api/hooks.ts              +useSimilarGames()
apps/mobile/src/features/game/game-detail-screen.tsx  +basePath prop, +section
apps/mobile/src/app/(tabs)/(home)/game/[id].tsx       wrapper
apps/mobile/src/app/(tabs)/explore/game/[id].tsx      wrapper
apps/mobile/src/app/(tabs)/search/game/[id].tsx       wrapper
README.md                                 route table + apps/api section
docs/mobile-device-verification.md        +manual check
```

**New**

```
apps/mobile/src/features/game/similar-games.tsx
```

## 9. Testing

| Where | What |
|---|---|
| `packages/igdb/test/games-query.test.ts` | `similar_games` present in the field list |
| `packages/igdb/test/map.test.ts` | ids mapped; duplicates collapsed; self-reference dropped; absent field yields `[]` |
| `packages/igdb/test/contract.test.ts` | already covers it — IGDB `400`s on a dead field |
| `packages/db/test/mirror-schema.test.ts` | `similar_game_id` accepts a nonexistent game |
| `packages/db/test/games-queries.test.ts` | dangling id dropped; non-searchable type filtered; ordering; limit; directionality |
| `apps/worker/test/persist.test.ts` | rows written; replay is a no-op; a dropped suggestion disappears |
| `apps/api/test/games-routes.test.ts` | `200` shape; `404` unknown id; `422` bad limit; `Cache-Control`; repeat served from cache; version bump invalidates |
| `apps/mobile/test/api-endpoints.test.ts` | path and query construction |
| `apps/mobile/test/api-keys.test.ts` | key shape |

The mobile section gets no component test — the repo has no component tests, by
convention. `docs/mobile-device-verification.md` takes the manual check instead:
tap through two levels of detail screen and confirm the push stays inside the
current tab with the tab bar visible.

## 10. Rollout

1. Migration creates an empty table. **Deploying here is safe**: every section
   renders nothing while the table is empty, so there is no window in which the
   feature looks broken. No feature flag.
2. `pnpm --filter worker sync --full` backfills. 748 pages of 500 at 4 requests
   per second is roughly three minutes of IGDB time; the database writes
   dominate. The advisory lock means it cannot collide with the nightly cron.
3. That run ends by bumping `SEARCH_VERSION_KEY`, invalidating any `similar:v*`
   entries cached as empty during the window. So step 1 and step 2 need no
   coordination.

Coverage is the one thing unmeasurable before the backfill:

```sql
-- global, across all mirrored games
SELECT count(DISTINCT game_id) FROM game_similar;

-- among games people actually open
SELECT count(*) FROM games g
WHERE g.total_rating_count > 50
  AND EXISTS (SELECT 1 FROM game_similar s WHERE s.game_id = g.id);
```

The second number is the one that matters; global coverage across 373,590 mostly
obscure games is a vanity metric.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Coverage among popular games disappoints | Measured immediately after backfill by the second query in §10. The section renders nothing where data is missing, so a poor result is invisible rather than broken, and it is the trigger to revisit §12's computed fallback. |
| IGDB deprecates `similar_games` later | The nightly contract test fails the build on a dead field. Detection is automatic; the section then degrades to nothing. |
| `--full` re-sync churn | Every write is an upsert, so the run is replay-safe by construction, and the advisory lock prevents overlap with the cron. |
| IGDB's suggestions are occasionally odd | Accepted. It is the same source as every other field on the screen, and the alternative is a heuristic we would have to defend instead. |

## 12. Deferred

- **Computed similarity as a fallback** where IGDB's list is empty: weighted
  genre overlap with rarer genres counting for more, plus platform and developer
  overlap, tuned by constants beside the existing search-ranking ones. Needs
  reverse indexes on `game_genres.genre_id` and `game_companies.company_id`,
  which do not exist today. Gated on the coverage measurement, not before.
- **"More in this series"** from `parent_game`, and the `collections`,
  `remakes`, `remasters` and `ports` relations visible in IGDB's proto.
- **"More from this developer"** from `game_companies`.
