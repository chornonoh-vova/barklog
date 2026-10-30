# Similar Games

**Status:** Implemented reference, reconciled with code on 2026-10-29.

Similar games let a player continue browsing from game detail. Suggestions come from IGDB's mirrored `similar_games` relationship, without live IGDB calls, personalization or computed genre overlap. This follows [ADR-0001](../../adr/0001-local-game-mirror.md).

## Data and API behavior

[The IGDB field query](../../../packages/igdb/src/games-query.ts) requests bare similar-game ids. [Mapping](../../../packages/igdb/src/map.ts) removes duplicates and self-references; [page persistence](../../../apps/worker/src/persist.ts) replaces relationships for the page's games transactionally, so replay is safe and removed suggestions disappear.

[The `game_similar` table](../../../packages/db/src/schema/mirror.ts) has a composite primary key and a cascading foreign key for its source game. Its target deliberately has no foreign key: an ascending-id sync can encounter a target before inserting it. [The read query](../../../packages/db/src/queries/games.ts) inner-joins targets, dropping dangling ids until they appear in the mirror. Relationships are directional; A listing B does not imply B lists A.

Results include only searchable game types, including games without cover art. They are ordered by rating count descending, then id ascending. IGDB's array order is not treated as a ranking contract; a stable local order also makes limits deterministic.

[The API route](../../../apps/api/src/routes/games.ts), `GET /api/games/:id/similar`, returns the existing game-list shape. [Request validation](../../../packages/contracts/src/games.ts) defaults to 12 and caps the limit at the shared search maximum of 50. An unknown source game returns 404 from inside the cache loader, so that failure is not cached.

The separate route keeps suggestions reusable across users: game detail embeds the caller's backlog entry and cannot use the same shared cache. [The similar cache](../../../apps/api/src/cache-keys.ts) lasts one hour and includes search version, game id and limit; sync invalidation advances the version. HTTP responses remain `private, max-age=300` because the API is authenticated. Suggestions contain no personal backlog state.

## Mobile behavior and rationale

[SimilarGames](../../../apps/mobile/src/features/game/similar-games.tsx) renders a single horizontal row of ordinary game tiles with a localized title. With no available items it renders nothing, including initial loading, an empty result or an initial failure. A failed refetch can retain previously cached items; there is no separate error banner.

[Query hooks](../../../apps/mobile/src/lib/api/hooks.ts) and [keys](../../../apps/mobile/src/lib/api/keys.ts) keep similar results separate from personal game detail, so a backlog write need not invalidate them. The detail screen receives its navigation callback from its route, preserving the current tab or share stack when another game is opened. This avoids hardcoded tab prefixes inside shared UI and preserves typed route literals at the route boundary.

One row keeps discovery subordinate to the detail screen. Missing covers use the normal placeholder rather than discarding a potentially useful match. Empty sections also make incremental mirror population safe without a feature flag. Actual suggestion coverage depends on upstream data and sync completeness; the original backfill measurements are historical, not current guarantees.

## Evidence

- [Field query tests](../../../packages/igdb/test/games-query.test.ts) and [mapping tests](../../../packages/igdb/test/map.test.ts): requested relationships, deduplication and self-filtering.
- [Schema tests](../../../packages/db/test/mirror-schema.test.ts), [query tests](../../../packages/db/test/games-queries.test.ts) and [persistence tests](../../../apps/worker/test/persist.test.ts): soft targets, read filtering/order and replacement on replay.
- [API tests](../../../apps/api/test/games-routes.test.ts): validation, not-found behavior, response caching and version invalidation.
- [Mobile component tests](../../../apps/mobile/src/features/game/similar-games.test.tsx): available and absent sections, tile rendering and selection. Native stack behavior also belongs in [device verification](../../mobile-device-verification.md).

Use current workspace scripts for validation and the root [README](../../../README.md) for sync operations. This reference replaces the original rollout checklist and copied implementation snippets.
