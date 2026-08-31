# Similar Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Similar Games" row to the game detail screen, sourced from IGDB's own `similar_games`, mirrored locally and served from a separate cacheable endpoint.

**Architecture:** IGDB's `similar_games` (bare game ids) is pulled by the nightly sync into a new `game_similar` join table whose target column carries no foreign key, because a sync page routinely names a game not yet inserted. A new `GET /api/games/:id/similar` re-ranks the relation by popularity, drops dangling ids via an inner join, filters to searchable game types, and caches the result in Valkey for an hour behind the existing search-version prefix. The mobile screen renders a horizontal row of the existing `GameTile`, and renders nothing at all when the list is empty — which makes every step below safe to deploy before the backfill runs.

**Tech Stack:** TypeScript, valibot, drizzle-orm, Postgres 18, Hono, Valkey, React Native 0.86 / Expo SDK 57, expo-router 57, TanStack Query, vitest, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-31-similar-games-design.md`

## Global Constraints

- **Read the versioned Expo docs** at https://docs.expo.dev/versions/v57.0.0/ before writing any mobile code (`apps/mobile/AGENTS.md`).
- **Section title copy is exactly `Similar Games`.** Not "You Might Also Like", not "More Like This".
- **Default limit is 12**; the cap is the shared `SEARCH_LIMIT_MAX` (50). Do not introduce a third limit constant.
- **Ordering is `total_rating_count DESC, id ASC`** everywhere. No `position` column, ever — IGDB's array order is deliberately discarded.
- **`similar_game_id` must NOT have a foreign key.** An FK there fails sync pages. This is load-bearing.
- **Filter to `SEARCHABLE_GAME_TYPE_IDS` only.** Do not also filter on `coverImageId` — `components/cover.tsx` draws a placeholder.
- **Never add `similar` to `GameDetailWire`** or to the `GET /api/games/:id` response.
- **No new wire type.** The route returns the existing `GameListResponse`.
- **Typed routes are enabled** (`app.json` → `experiments.typedRoutes`). `Href` is a union of template-literal types; a `string` path variable will not type-check.
- Every new exported symbol needs a comment explaining *why*, matching the density of the surrounding code. This codebase comments decisions, not mechanics.
- `pnpm --filter @repo/db test`, `pnpm --filter worker test` and `pnpm --filter api test` start Postgres/Valkey via Testcontainers. Docker must be running.

---

## File Structure

**New**

| File | Responsibility |
|---|---|
| `apps/mobile/src/features/game/similar-games.tsx` | The section: fetch, render-nothing-when-empty, a row of `GameTile`s |
| `packages/db/drizzle/0004_*.sql` | Generated migration creating `game_similar` |

**Modified**

| File | Change |
|---|---|
| `packages/igdb/src/games-query.ts` | `+"similar_games"` in `GAME_FIELDS` |
| `packages/igdb/src/schemas.ts` | `+similar_games: v.optional(v.array(int))` |
| `packages/igdb/src/map.ts` | `+MappedPage.gameSimilar`, dedup, self-reference filter |
| `packages/db/src/schema/mirror.ts` | `+gameSimilar` table |
| `packages/db/src/testing.ts` | `+game_similar` in `truncateAll` |
| `packages/db/src/queries/games.ts` | `+similarGames()` |
| `packages/contracts/src/games.ts` | `+SIMILAR_LIMIT_DEFAULT`, `+similarQuerySchema` |
| `apps/worker/src/persist.ts` | `+`delete and insert for the relation |
| `apps/api/src/cache-keys.ts` | `+SIMILAR_TTL_SECONDS`, `+similarKey()` |
| `apps/api/src/routes/games.ts` | `+GET /:id/similar` |
| `apps/mobile/src/api/endpoints.ts` | `+similarGames()` |
| `apps/mobile/src/api/keys.ts` | `+games.similar()` |
| `apps/mobile/src/api/hooks.ts` | `+useSimilarGames()` |
| `apps/mobile/src/features/game/game-detail-screen.tsx` | `+onOpenGame` prop, `+`section |
| `apps/mobile/src/app/(tabs)/{(home),explore,search}/game/[id].tsx` | Wrappers supplying the push |
| `README.md` | Route table + `apps/api` section |
| `docs/mobile-device-verification.md` | Manual in-tab navigation check |

**Task dependency order:** 1 → 2 → {3, 4} → 5 → 6 → 7 → 8 → 9. Tasks 3 and 4 both depend on 2 and are independent of each other.

---

## Task 1: Pull `similar_games` from IGDB

**Files:**
- Modify: `packages/igdb/src/games-query.ts:6-30` (the `GAME_FIELDS` array)
- Modify: `packages/igdb/src/schemas.ts:20-52` (`igdbGameSchema`)
- Modify: `packages/igdb/src/map.ts:5-33` (`MappedPage`), `:37-118` (`mapGames`)
- Test: `packages/igdb/test/games-query.test.ts`, `packages/igdb/test/map.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MappedPage.gameSimilar: { gameId: number; similarGameId: number }[]`. Task 3 writes these rows.

**Background:** IGDB omits absent fields rather than sending `null`, so every optional field is `v.optional()` and the mapper turns absence into an empty list. `similar_games` is `repeated Game` in IGDB's proto; requested unexpanded it returns bare numeric ids, exactly as `parent_game` does.

- [ ] **Step 1: Write the failing field-list test**

Add to `packages/igdb/test/games-query.test.ts`:

```ts
test("the field list requests similar games as bare ids", () => {
  // `similar_games` is `repeated Game`, so requesting it unexpanded yields ids
  // rather than nested objects. Expanding it would multiply the page payload
  // for data the mirror already holds.
  expect(GAME_FIELDS).toContain("similar_games");
  expect(GAME_FIELDS).not.toMatch(/similar_games\./);
});
```

- [ ] **Step 2: Write the failing mapper tests**

Add to `packages/igdb/test/map.test.ts`:

```ts
test("maps similar game ids into join rows", () => {
  const page = mapGames([{ ...FULL_GAME, similar_games: [1943, 472, 11156] }]);

  expect(page.gameSimilar).toEqual([
    { gameId: 1942, similarGameId: 1943 },
    { gameId: 1942, similarGameId: 472 },
    { gameId: 1942, similarGameId: 11156 },
  ]);
});

test("a game is never similar to itself", () => {
  // IGDB's list is generated, not curated. A self-reference would render the
  // game inside its own Similar Games row.
  const page = mapGames([{ ...FULL_GAME, similar_games: [1942, 472] }]);

  expect(page.gameSimilar).toEqual([{ gameId: 1942, similarGameId: 472 }]);
});

test("a repeated similar id collapses to one row", () => {
  // The table's primary key is (game_id, similar_game_id), so a duplicate
  // inside one page would be a unique violation that fails the whole
  // transaction. Unlike genres, this list is not a curated set we can trust.
  const page = mapGames([{ ...FULL_GAME, similar_games: [472, 472] }]);

  expect(page.gameSimilar).toEqual([{ gameId: 1942, similarGameId: 472 }]);
});

test("an absent similar_games field yields no rows", () => {
  const page = mapGames([{ id: 7, name: "Minimal", slug: "minimal", updated_at: 1700000000 }]);

  expect(page.gameSimilar).toEqual([]);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @repo/igdb test`
Expected: FAIL — `GAME_FIELDS` does not contain `similar_games`, and `page.gameSimilar` is `undefined`.

- [ ] **Step 4: Add the field to the query**

In `packages/igdb/src/games-query.ts`, add to `GAME_FIELDS` immediately after `"parent_game"`:

```ts
  "parent_game",
  // Bare ids, not expanded: the mirror already holds every game, so the ids
  // resolve locally on read. Soft references like `parent_game` — the target
  // may not be mirrored yet when this page lands.
  "similar_games",
```

- [ ] **Step 5: Add the field to the schema**

In `packages/igdb/src/schemas.ts`, add to `igdbGameSchema` after `parent_game`:

```ts
  parent_game: v.optional(int),
  similar_games: v.optional(v.array(int)),
```

- [ ] **Step 6: Add the mapper output**

In `packages/igdb/src/map.ts`, add to the `MappedPage` interface after `gamePlatforms`:

```ts
  gameSimilar: { gameId: number; similarGameId: number }[];
```

Add `gameSimilar: []` to the `page` literal initialiser. Declare a dedup map beside the existing `gameCompanies` one:

```ts
  // Keyed `${gameId}:${similarId}`. Unlike genres and platforms — curated sets
  // where trusting IGDB not to repeat an entry is safe — this list is
  // algorithmically generated, and one duplicate would be a unique violation
  // that fails the entire page.
  const gameSimilar = new Map<string, MappedPage["gameSimilar"][number]>();
```

Inside the `for (const game of games)` loop, after the screenshots loop:

```ts
    for (const similarId of game.similar_games ?? []) {
      // A game inside its own Similar Games row reads as a bug, and IGDB's
      // generated list does not rule it out.
      if (similarId === game.id) continue;

      gameSimilar.set(`${game.id}:${similarId}`, {
        gameId: game.id,
        similarGameId: similarId,
      });
    }
```

And beside the other `[...map.values()]` assignments at the end:

```ts
  page.gameSimilar = [...gameSimilar.values()];
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @repo/igdb test`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 8: Verify types and lint**

Run: `pnpm --filter @repo/igdb check-types && pnpm --filter @repo/igdb lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/igdb
git commit -m "feat(igdb): pull similar_games into the mapped page

Bare ids, deduplicated, self-references dropped. The list is generated
rather than curated, so it gets two guards the other join tables do
without."
```

---

## Task 2: The `game_similar` table

**Files:**
- Modify: `packages/db/src/schema/mirror.ts` (append after `gameCompanies`)
- Modify: `packages/db/src/testing.ts:31-40` (`truncateAll`)
- Create: `packages/db/drizzle/0004_*.sql` (generated — do not hand-write)
- Test: `packages/db/test/mirror-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `schema.gameSimilar` with columns `gameId`, `similarGameId`. Tasks 3, 4 and 6 use it.

**Background:** The sync paginates by ascending id (`gamesPageQuery` sorts `id asc`), so a page of low ids routinely names similar games with higher ids that have not been inserted yet. An FK on the target would reject those rows and fail the page. `games.parentGameId` already has this exact property and carries a comment plus a test saying so.

- [ ] **Step 1: Write the failing soft-reference test**

Add to `packages/db/test/mirror-schema.test.ts` (import `gameSimilar` from `../src/schema/index.js`):

```ts
test("similar_game_id is a soft reference with no foreign key", async () => {
  // The sync walks ids ascending, so a page routinely names a similar game
  // that has not been inserted yet. An FK here would fail the page. Dangling
  // ids are dropped on read by an inner join instead.
  await db.insert(games).values({
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await db.insert(gameSimilar).values({ gameId: 1942, similarGameId: 424242 });

  const rows = await db.select().from(gameSimilar);
  expect(rows).toEqual([{ gameId: 1942, similarGameId: 424242 }]);
});

test("game_similar cascades when its owning game is deleted", async () => {
  await db.insert(games).values({
    id: 1942,
    name: "The Witcher 3: Wild Hunt",
    slug: "the-witcher-3-wild-hunt",
    igdbUpdatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await db.insert(gameSimilar).values({ gameId: 1942, similarGameId: 472 });

  await db.delete(games).where(sql`${games.id} = 1942`);

  expect(await db.select().from(gameSimilar)).toHaveLength(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @repo/db test -t "soft reference with no foreign key"`
Expected: FAIL — `gameSimilar` is not exported from the schema.

- [ ] **Step 3: Add the table**

Append to `packages/db/src/schema/mirror.ts`:

```ts
/**
 * IGDB's own `similar_games`, one row per suggestion. The relation is
 * directional — A listing B does not make B list A — and is read forward only.
 */
export const gameSimilar = pgTable(
  "game_similar",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    // Deliberately no foreign key, for the same reason as games.parentGameId:
    // the sync walks ids ascending, so a page routinely names a similar game
    // not yet inserted, and an FK would fail the page. Dangling ids are
    // dropped on read by the inner join in similarGames().
    similarGameId: integer("similar_game_id").notNull(),
  },
  // No secondary index: the only read is `where game_id = $1`, which the
  // primary key's leading column already serves.
  (t) => [primaryKey({ columns: [t.gameId, t.similarGameId] })],
);
```

- [ ] **Step 4: Add the table to `truncateAll`**

In `packages/db/src/testing.ts`, add `game_similar` to the join-table line:

```sql
      game_companies, game_platforms, game_genres, game_screenshots, game_similar,
```

`ON DELETE cascade` from `games` would cover it, but that list is explicit and an omission surfaces later as cross-test bleed.

- [ ] **Step 5: Generate the migration**

Run: `pnpm --filter @repo/db db:generate`

Expected: a new `packages/db/drizzle/0004_<two-words>.sql` containing approximately:

```sql
CREATE TABLE "game_similar" (
	"game_id" integer NOT NULL,
	"similar_game_id" integer NOT NULL,
	CONSTRAINT "game_similar_game_id_similar_game_id_pk" PRIMARY KEY("game_id","similar_game_id")
);
--> statement-breakpoint
ALTER TABLE "game_similar" ADD CONSTRAINT "game_similar_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;
```

**Verify there is exactly ONE `ADD CONSTRAINT ... FOREIGN KEY` line** — on `game_id`. If a second appears for `similar_game_id`, the schema has a stray `.references()`; fix the schema and regenerate rather than editing the SQL.

Do not hand-edit the generated file, and do not rename it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @repo/db test`
Expected: PASS. Testcontainers applies the new migration automatically via `runMigrations` in `startPostgres`.

- [ ] **Step 7: Verify types and lint**

Run: `pnpm --filter @repo/db check-types && pnpm --filter @repo/db lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): game_similar mirror table

No foreign key on similar_game_id: the sync walks ids ascending, so a
page routinely names a game not yet inserted. Dangling ids are dropped
on read instead."
```

---

## Task 3: `persistPage` writes the relation

**Files:**
- Modify: `apps/worker/src/persist.ts:82-100` (the delete block and the guarded inserts)
- Test: `apps/worker/test/persist.test.ts`

**Interfaces:**
- Consumes: `MappedPage.gameSimilar` (Task 1), `schema.gameSimilar` (Task 2).
- Produces: nothing new.

**Background:** Join rows are replaced wholesale — deleted for the page's games, then re-inserted — which is what makes a suggestion IGDB has dropped actually disappear, and what makes replaying a page a no-op. That replay property is what the sync's failure model depends on: a failed run does not advance the watermark, so the next run re-fetches the same range.

- [ ] **Step 1: Write the failing tests**

In `apps/worker/test/persist.test.ts`, add `similar_games` to both `PAGE` entries so the existing replay and rollback tests cover the new rows too:

```ts
// in PAGE[0] (id 1942), after `screenshots`:
    similar_games: [1943, 472],
// in PAGE[1] (id 1943), after `platforms`:
    similar_games: [1942],
```

Add `gameSimilar` to `snapshot()` so the replay test covers it:

```ts
    gameSimilar: await db.select().from(schema.gameSimilar),
```

Then add:

```ts
test("similar game rows are written for the page", async () => {
  await persistPage(db, mapGames(PAGE));

  const rows = await db
    .select()
    .from(schema.gameSimilar)
    .orderBy(schema.gameSimilar.gameId, schema.gameSimilar.similarGameId);

  expect(rows).toEqual([
    { gameId: 1942, similarGameId: 472 },
    { gameId: 1942, similarGameId: 1943 },
    { gameId: 1943, similarGameId: 1942 },
  ]);
});

test("a similar id pointing outside the mirror is still stored", async () => {
  // 472 is not in this page and not in the database. The row must persist —
  // the inner join on read is what hides it until the mirror catches up.
  await persistPage(db, mapGames(PAGE));

  const rows = await db
    .select()
    .from(schema.gameSimilar)
    .where(eq(schema.gameSimilar.similarGameId, 472));

  expect(rows).toHaveLength(1);
});

test("a similar game IGDB dropped disappears on re-sync", async () => {
  await persistPage(db, mapGames(PAGE));
  await persistPage(db, mapGames([{ ...PAGE[0]!, similar_games: [] }]));

  const rows = await db.select().from(schema.gameSimilar);

  // 1942's suggestions are gone; 1943's are untouched, because the delete is
  // scoped to the games in the page.
  expect(rows).toEqual([{ gameId: 1943, similarGameId: 1942 }]);
});
```

Add `eq` to the drizzle-orm import at the top of the file if it is not already there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter worker test`
Expected: FAIL — `game_similar` is empty because `persistPage` does not write it.

- [ ] **Step 3: Add the delete**

In `apps/worker/src/persist.ts`, alongside the other scoped deletes:

```ts
    await tx.delete(schema.gameSimilar).where(inArray(schema.gameSimilar.gameId, gameIds));
```

- [ ] **Step 4: Add the insert**

With the other guarded inserts:

```ts
    if (page.gameSimilar.length > 0) {
      await tx.insert(schema.gameSimilar).values(page.gameSimilar);
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter worker test`
Expected: PASS, including the pre-existing "replaying the same page leaves the database identical" now that `snapshot()` covers `gameSimilar`.

- [ ] **Step 6: Verify types and lint**

Run: `pnpm --filter worker check-types && pnpm --filter worker lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/worker
git commit -m "feat(worker): persist the similar games relation

Delete-then-insert scoped to the page, like the other join tables, so a
suggestion IGDB dropped disappears and a replay stays a no-op."
```

---

## Task 4: The `similarGames` query

**Files:**
- Modify: `packages/db/src/queries/games.ts` (append after `getGameDetail`)
- Test: `packages/db/test/games-queries.test.ts`

**Interfaces:**
- Consumes: `schema.gameSimilar` (Task 2).
- Produces: `similarGames(db, { gameId, limit }): Promise<GameSummary[]>`. Task 6 calls it.

**Background:** `GAME_SUMMARY_COLUMNS` is the projection every list endpoint returns. `searchableType` is the module-level `inArray(games.gameTypeId, SEARCHABLE_GAME_TYPE_IDS)` constant — type 1 is DLC and must not surface. The `asc(games.id)` tiebreak gives a total order so a `LIMIT` cannot produce an unstable list.

- [ ] **Step 1: Write the failing tests**

Add to `packages/db/test/games-queries.test.ts`. Import `similarGames` from `../src/queries/games.js`, and add this helper beside `seed`:

```ts
async function seedSimilar(gameId: number, similarIds: number[]): Promise<void> {
  await db
    .insert(schema.gameSimilar)
    .values(similarIds.map((similarGameId) => ({ gameId, similarGameId })));
}
```

Then:

```ts
test("similar games come back most-rated first", async () => {
  await seed(RANKING_FIXTURES);
  await seedSimilar(1, [2, 4, 6]);

  const rows = await similarGames(db, { gameId: 1, limit: 12 });

  // 6 = Dark Souls III (4000), 4 = Odyssey (2500), 2 = Ocarina (2000).
  // IGDB's array order is deliberately discarded.
  expect(rows.map((row) => row.id)).toEqual([6, 4, 2]);
});

test("a similar id missing from the mirror is dropped", async () => {
  await seed(RANKING_FIXTURES);
  await seedSimilar(1, [2, 999_999]);

  const rows = await similarGames(db, { gameId: 1, limit: 12 });

  // The inner join is what hides it. No EXISTS clause, no cleanup job.
  expect(rows.map((row) => row.id)).toEqual([2]);
});

test("DLC is filtered out however popular it is", async () => {
  await seed(RANKING_FIXTURES);
  // 8 is type 1 (DLC) with a rating count of 9000 — it would sort first.
  await seedSimilar(6, [7, 8]);

  const rows = await similarGames(db, { gameId: 6, limit: 12 });

  expect(rows.map((row) => row.id)).toEqual([7]);
});

test("the relation is directional", async () => {
  await seed(RANKING_FIXTURES);
  await seedSimilar(1, [2]);

  // A listing B does not make B list A. This is IGDB's shape, not an
  // accident of storage.
  expect(await similarGames(db, { gameId: 2, limit: 12 })).toEqual([]);
});

test("the limit is respected", async () => {
  await seed(RANKING_FIXTURES);
  await seedSimilar(1, [2, 4, 6, 7]);

  const rows = await similarGames(db, { gameId: 1, limit: 2 });

  expect(rows.map((row) => row.id)).toEqual([6, 7]);
});

test("a game with no suggestions returns an empty list, not an error", async () => {
  await seed(RANKING_FIXTURES);

  expect(await similarGames(db, { gameId: 1, limit: 12 })).toEqual([]);
});

test("similar games carry the same projection as every other list", async () => {
  await seed(RANKING_FIXTURES);
  await seedSimilar(1, [2]);

  const [row] = await similarGames(db, { gameId: 1, limit: 12 });

  expect(Object.keys(row!).sort()).toEqual([
    "coverImageId",
    "firstReleaseDate",
    "id",
    "name",
    "slug",
    "totalRating",
    "totalRatingCount",
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @repo/db test -t "similar"`
Expected: FAIL — `similarGames` is not exported.

- [ ] **Step 3: Implement the query**

Append to `packages/db/src/queries/games.ts`. Add `gameSimilar` to the existing `schema/mirror.js` import list.

```ts
/**
 * IGDB's own `similar_games`, re-ranked rather than replayed: IGDB's array
 * order is undocumented, so preserving it would be cargo-culting, and this is
 * the same total order every other feed uses — a LIMIT cannot produce an
 * unstable list.
 *
 * The inner join drops ids the mirror does not hold yet, which is why the
 * stored relation needs no foreign key and no cleanup job. Read forward only:
 * A listing B does not make B list A.
 */
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @repo/db test`
Expected: PASS.

- [ ] **Step 5: Verify types and lint**

Run: `pnpm --filter @repo/db check-types && pnpm --filter @repo/db lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): similarGames query

Re-ranked by popularity, DLC filtered, dangling ids dropped by the inner
join."
```

---

## Task 5: Contract and cache key

**Files:**
- Modify: `packages/contracts/src/games.ts` (append after `gameFeedQuerySchema`)
- Modify: `apps/api/src/cache-keys.ts` (append after `feedKey`)
- Test: `packages/contracts/test/contracts.test.ts`

**Interfaces:**
- Consumes: `SEARCH_LIMIT_MAX`, `integerFrom` (both already in `packages/contracts/src`).
- Produces: `SIMILAR_LIMIT_DEFAULT = 12`, `similarQuerySchema` (`{ limit: number }`), `SIMILAR_TTL_SECONDS = 3600`, `similarKey(version, gameId, limit): string`. Tasks 6 and 7 use these.

**Background:** `integerFrom(min, max)` coerces with `Number` then validates, so junk becomes `NaN` and fails rather than silently falling back to the default. The cache key is version-prefixed because the worker calls `incr(SEARCH_VERSION_KEY)` at the end of every successful sync, which is what sweeps stale entries.

- [ ] **Step 1: Write the failing contract tests**

Add to `packages/contracts/test/contracts.test.ts` (follow the file's existing import and `describe` style):

```ts
test("the similar-games limit defaults to twelve", () => {
  expect(v.parse(similarQuerySchema, {})).toEqual({ limit: SIMILAR_LIMIT_DEFAULT });
  expect(SIMILAR_LIMIT_DEFAULT).toBe(12);
});

test("the similar-games limit shares the search cap", () => {
  expect(() => v.parse(similarQuerySchema, { limit: SEARCH_LIMIT_MAX })).not.toThrow();
  expect(() => v.parse(similarQuerySchema, { limit: SEARCH_LIMIT_MAX + 1 })).toThrow();
  expect(() => v.parse(similarQuerySchema, { limit: 0 })).toThrow();
});

test("a non-numeric similar-games limit is rejected, not defaulted", () => {
  expect(() => v.parse(similarQuerySchema, { limit: "abc" })).toThrow();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @repo/contracts test`
Expected: FAIL — `similarQuerySchema` is not exported.

- [ ] **Step 3: Add the contract**

Append to `packages/contracts/src/games.ts`:

```ts
/** What IGDB actually supplies for a well-covered game. */
export const SIMILAR_LIMIT_DEFAULT = 12;

/**
 * `GET /api/games/:id/similar`. Its own default, but the shared
 * `SEARCH_LIMIT_MAX` cap rather than a third limit constant — asking for more
 * than IGDB stores simply yields a shorter list.
 */
export const similarQuerySchema = v.object({
  limit: v.optional(integerFrom(1, SEARCH_LIMIT_MAX), SIMILAR_LIMIT_DEFAULT),
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @repo/contracts test && pnpm --filter @repo/contracts check-types`
Expected: PASS.

- [ ] **Step 5: Add the cache key**

Append to `apps/api/src/cache-keys.ts`:

```ts
/**
 * An hour, like the feeds: the relation only changes when a sync writes it.
 * Unlike the feeds there is no day bucketing — nothing here moves at midnight.
 */
export const SIMILAR_TTL_SECONDS = 3600;

/**
 * Version-prefixed, so the `incr(SEARCH_VERSION_KEY)` the worker performs at
 * the end of a successful sync sweeps these too. No `sha1` — there is no free
 * text in this key to normalise or bound.
 */
export function similarKey(version: number, gameId: number, limit: number): string {
  return `similar:v${version}:${gameId}:${limit}`;
}
```

- [ ] **Step 6: Verify types and lint**

Run: `pnpm --filter api check-types && pnpm --filter api lint && pnpm --filter @repo/contracts lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts apps/api/src/cache-keys.ts
git commit -m "feat(contracts): similar-games query schema and cache key

Default 12, shared SEARCH_LIMIT_MAX cap, version-prefixed key so a sync
sweeps it."
```

---

## Task 6: `GET /api/games/:id/similar`

**Files:**
- Modify: `apps/api/src/routes/games.ts` (new route registered before the `/:id` handler)
- Modify: `apps/api/test/helpers.ts` (add `seedSimilar`)
- Test: `apps/api/test/games-routes.test.ts`

**Interfaces:**
- Consumes: `similarGames` (Task 4), `similarQuerySchema` + `SIMILAR_LIMIT_DEFAULT` (Task 5), `SIMILAR_TTL_SECONDS` + `similarKey` (Task 5), and the existing `gameExists`, `gameIdParamSchema`, `toGameSummary`, `FEED_CACHE_CONTROL`.
- Produces: `GET /api/games/:id/similar?limit=` returning `{ items: GameSummaryWire[] }`.

**Background:** `withCache(cache, key, ttl, load)` is read-through and fails open — a Valkey outage degrades to a direct `load()`, never an error. A throw from `load` propagates without caching anything, which is what lets the existence check live inside it: a cache hit then pays nothing for that check. An empty array caches correctly (`hit !== null`); only a cached `null` would be a problem, and this loader never returns one.

`PUT /api/backlog/:gameId` already guards an unknown game with the same `gameExists` helper, so the 404 is an established pattern rather than a new one.

- [ ] **Step 1: Add the seeding helper**

Append to `apps/api/test/helpers.ts`:

```ts
/** Seeds the similar-games relation. Ids need not exist — that is the point. */
export async function seedSimilar(
  db: Db,
  gameId: number,
  similarIds: number[],
): Promise<void> {
  await db
    .insert(schema.gameSimilar)
    .values(similarIds.map((similarGameId) => ({ gameId, similarGameId })));
}
```

- [ ] **Step 2: Write the failing route tests**

Add to `apps/api/test/games-routes.test.ts`, importing `seedSimilar` and `SIMILAR_TTL_SECONDS`/`similarKey` as needed:

```ts
test("similar games are returned most-rated first with a feed cache directive", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });
  await seedGame(harness.db, { id: 2, name: "Dark Souls III", count: 4000 });
  await seedGame(harness.db, { id: 3, name: "Elden Ring", count: 2000 });
  await seedSimilar(harness.db, 1, [2, 3]);

  const response = await callApi(harness.app, "/api/games/1/similar");
  const body = (await response.json()) as { items: { id: number }[] };

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, max-age=300");
  expect(body.items.map((item) => item.id)).toEqual([2, 3]);
});

test("a similar id the mirror does not hold is omitted", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });
  await seedSimilar(harness.db, 1, [999_999]);

  const response = await callApi(harness.app, "/api/games/1/similar");

  expect(((await response.json()) as { items: unknown[] }).items).toEqual([]);
});

test("a game with no suggestions is 200 and empty, not 404", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });

  const response = await callApi(harness.app, "/api/games/1/similar");

  expect(response.status).toBe(200);
  expect(((await response.json()) as { items: unknown[] }).items).toEqual([]);
});

test("similar games for an unmirrored id is 404", async () => {
  // An empty list would be a lie about a game that does not exist.
  const response = await callApi(harness.app, "/api/games/424242/similar");
  const body = (await response.json()) as { status: number; detail: string };

  expect(response.status).toBe(404);
  expect(body.detail).toContain("424242");
});

test("a limit over the cap is 422", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });

  const response = await callApi(harness.app, "/api/games/1/similar?limit=500");
  const body = (await response.json()) as { errors: { field: string }[] };

  expect(response.status).toBe(422);
  expect(body.errors[0]?.field).toBe("limit");
});

test("the default limit is twelve", async () => {
  await seedGame(harness.db, { id: 1, name: "Subject", count: 10 });
  for (let id = 100; id < 120; id += 1) {
    await seedGame(harness.db, { id, name: `Similar ${id}`, count: id });
  }
  await seedSimilar(
    harness.db,
    1,
    Array.from({ length: 20 }, (_unused, index) => 100 + index),
  );

  const response = await callApi(harness.app, "/api/games/1/similar");

  expect(((await response.json()) as { items: unknown[] }).items).toHaveLength(12);
});

test("a repeated request is served from the cache", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });
  await seedGame(harness.db, { id: 2, name: "Dark Souls III", count: 4000 });
  await seedSimilar(harness.db, 1, [2]);

  const first = await callApi(harness.app, "/api/games/1/similar");
  expect(((await first.json()) as { items: unknown[] }).items).toHaveLength(1);

  // Remove the row the answer came from. A cached answer cannot notice.
  await harness.db.delete(schema.gameSimilar).where(eq(schema.gameSimilar.gameId, 1));

  const second = await callApi(harness.app, "/api/games/1/similar");
  expect(((await second.json()) as { items: unknown[] }).items).toHaveLength(1);
});

test("the version bump the sync performs invalidates cached similar games", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });
  await seedGame(harness.db, { id: 2, name: "Dark Souls III", count: 4000 });
  await seedSimilar(harness.db, 1, [2]);

  await callApi(harness.app, "/api/games/1/similar");
  await harness.db.delete(schema.gameSimilar).where(eq(schema.gameSimilar.gameId, 1));

  // Exactly what the worker does at the end of a successful run.
  await harness.cache.incr(SEARCH_VERSION_KEY);

  const fresh = await callApi(harness.app, "/api/games/1/similar");
  expect(((await fresh.json()) as { items: unknown[] }).items).toEqual([]);
});

test("a 404 is not cached", async () => {
  // The existence check lives inside the cache loader, and a throw must
  // propagate without storing anything — otherwise a game added by a later
  // sync would keep 404ing for the rest of the TTL.
  expect((await callApi(harness.app, "/api/games/1/similar")).status).toBe(404);

  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });

  expect((await callApi(harness.app, "/api/games/1/similar")).status).toBe(200);
});

test("the similar route is not shadowed by the :id catch-all", async () => {
  await seedGame(harness.db, { id: 1, name: "Dark Souls", count: 3500 });

  const response = await callApi(harness.app, "/api/games/1/similar");
  const body = (await response.json()) as Record<string, unknown>;

  // The detail route would answer with a name and a backlogEntry.
  expect(body).not.toHaveProperty("backlogEntry");
  expect(body).toHaveProperty("items");
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter api test -t "similar"`
Expected: FAIL — the route does not exist, so requests fall through to the `/:id` handler or 404.

- [ ] **Step 4: Implement the route**

In `apps/api/src/routes/games.ts`, add `similarQuerySchema` to the `@repo/contracts` import, `gameExists` and `similarGames` to the `@repo/db` import, and `SIMILAR_TTL_SECONDS` + `similarKey` to the `../cache-keys.js` import.

Register **before** the `.get("/:id", ...)` handler:

```ts
      // Registered before the `/:id` catch-all below. Two path segments cannot
      // actually collide with one, but keeping the order explicit is what makes
      // that route's "registered last" comment true.
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
              // cache hit pays nothing for the check. An empty list would be a
              // lie about a game that is not in the mirror at all.
              if (!(await gameExists(deps.db, id))) {
                throw problems.create("NOT_FOUND", {
                  detail: `Game ${id} is not in the mirror.`,
                });
              }

              return (await similarGames(deps.db, { gameId: id, limit })).map(toGameSummary);
            },
          );

          // Shareable across users, unlike the detail response beside it: this
          // list embeds nothing about the caller.
          c.header("Cache-Control", FEED_CACHE_CONTROL);
          return c.json({ items });
        },
      )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS, including the whole pre-existing suite (the `invariants.test.ts` problem-document invariant covers the new 404 and 422 automatically).

- [ ] **Step 6: Verify types and lint**

Run: `pnpm --filter api check-types && pnpm --filter api lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api
git commit -m "feat(api): GET /api/games/:id/similar

Its own cacheable route rather than a field on the detail response,
which is private/no-cache because it embeds the caller's backlog entry.
Existence check inside the cache loader so a 404 is never cached."
```

---

## Task 7: Mobile endpoint, key and hook

**Files:**
- Modify: `apps/mobile/src/api/endpoints.ts` (after `getGame`)
- Modify: `apps/mobile/src/api/keys.ts` (in the `games` namespace)
- Modify: `apps/mobile/src/api/hooks.ts` (after `useGame`)
- Test: `apps/mobile/test/api-endpoints.test.ts`, `apps/mobile/test/api-keys.test.ts`

**Interfaces:**
- Consumes: `SIMILAR_LIMIT_DEFAULT` (Task 5), the route from Task 6.
- Produces: `useSimilarGames(id: number, limit?: number): UseQueryResult<GameListResponse>`. Task 8 calls it.

**Background:** The query builder in `api/client.ts` drops `undefined` values. `keys.games.similar` deliberately does not nest under `keys.games.detail(id)`: the backlog mutations invalidate that key, and adding a game to your backlog does not change what is similar to it.

- [ ] **Step 1: Write the failing tests**

Add to `apps/mobile/test/api-keys.test.ts`:

```ts
  it("keys similar games by id and limit", () => {
    expect(keys.games.similar(1942, 12)).toEqual(["games", "similar", 1942, 12]);
  });

  it("keeps similar games outside the detail key, so a backlog write cannot clear it", () => {
    // The backlog mutations invalidate keys.games.detail(id). Adding a game to
    // your backlog does not change what is similar to it.
    expect(keys.games.similar(1942, 12)).not.toEqual(
      expect.arrayContaining(["detail"]),
    );
  });
```

Add to `apps/mobile/test/api-endpoints.test.ts`:

```ts
  it("fetches similar games with a default limit of twelve", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).similarGames(1942);

    expect(calls[0]).toEqual({
      path: "/api/games/1942/similar",
      options: { query: { limit: 12 } },
    });
  });

  it("passes an explicit similar-games limit through", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).similarGames(1942, { limit: 6 });

    expect(calls[0]?.options).toEqual({ query: { limit: 6 } });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter mobile test`
Expected: FAIL — `keys.games.similar` and `endpoints.similarGames` do not exist.

- [ ] **Step 3: Add the endpoint**

In `apps/mobile/src/api/endpoints.ts`, add `SIMILAR_LIMIT_DEFAULT` to the `@repo/contracts` import and, after `getGame`:

```ts
    similarGames: (id: number, input: { limit?: number } = {}) =>
      request<GameListResponse>(`/api/games/${id}/similar`, {
        query: { limit: input.limit ?? SIMILAR_LIMIT_DEFAULT },
      }),
```

- [ ] **Step 4: Add the key**

In `apps/mobile/src/api/keys.ts`, inside the `games` namespace:

```ts
    /**
     * Deliberately not nested under `detail`: the backlog mutations invalidate
     * that key, and adding a game to your backlog does not change what is
     * similar to it.
     */
    similar: (id: number, limit: number) => ["games", "similar", id, limit] as const,
```

- [ ] **Step 5: Add the hook**

In `apps/mobile/src/api/hooks.ts`, add `SIMILAR_LIMIT_DEFAULT` to the `@repo/contracts` import and, after `useGame`:

```ts
export function useSimilarGames(
  id: number,
  limit = SIMILAR_LIMIT_DEFAULT,
): UseQueryResult<GameListResponse> {
  const api = useApi();

  return useQuery({
    queryKey: keys.games.similar(id, limit),
    queryFn: () => api.similarGames(id, { limit }),
  });
}
```

The client's default 60 s `staleTime` is deliberately left alone: the response carries `max-age=300`, so the HTTP layer absorbs repeat opens, and the relation only changes on a nightly sync.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter mobile test`
Expected: PASS.

- [ ] **Step 7: Verify types and lint**

Run: `pnpm --filter mobile check-types && pnpm --filter mobile lint`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/api apps/mobile/test
git commit -m "feat(mobile): similar games endpoint, key and hook

The key sits outside games.detail so a backlog write does not clear it."
```

---

## Task 8: The section, and in-tab navigation

**Files:**
- Create: `apps/mobile/src/features/game/similar-games.tsx`
- Modify: `apps/mobile/src/features/game/game-detail-screen.tsx`
- Modify: `apps/mobile/src/app/(tabs)/(home)/game/[id].tsx`
- Modify: `apps/mobile/src/app/(tabs)/explore/game/[id].tsx`
- Modify: `apps/mobile/src/app/(tabs)/search/game/[id].tsx`

**Interfaces:**
- Consumes: `useSimilarGames` (Task 7), the existing `GameTile` and `summarySubtitle`.
- Produces: `<SimilarGames gameId onPressGame />`; `GameDetailScreen` gains a required `onOpenGame: (id: number) => void` prop.

**Background — read this before writing any code.** Typed routes are enabled, and the generated `href` type in `apps/mobile/.expo/types/router.d.ts` is a union of template-literal types:

```ts
| `/explore/game/${Router.SingleRoutePart<T>}${`?${string}` | `#${string}` | ''}`
| `/game/${Router.SingleRoutePart<T>}${...}`
| `/search/game/${Router.SingleRoutePart<T>}${...}`
```

A `string`-typed base path interpolated into a template yields `` `${string}/${number}` ``, which is far too wide to be assignable. **Do not pass a path into the screen** — pass the push itself, built in each route file from a literal, exactly as `features/explore/explore-screen.tsx` already does.

`GameTile` is memoised on `onPress`, so the callback must be wrapped in `useCallback` or the memo is defeated on every render.

- [ ] **Step 1: Create the section**

Create `apps/mobile/src/features/game/similar-games.tsx`:

```tsx
import type { GameSummaryWire } from "@repo/contracts";
import { FlatList, PlatformColor, StyleSheet, Text, View } from "react-native";

import { useSimilarGames } from "@/api/hooks";
import { GameTile } from "@/components/game-tile";
import { summarySubtitle } from "@/features/game/format";
import { Type } from "@/theme";

const keyExtractor = (game: GameSummaryWire) => String(game.id);

/**
 * In flight, empty and failed all render nothing — Explore's rule ("a shelf
 * that fails is simply not drawn") applied to a section. That is also what lets
 * the whole feature ship before the backfill has run: until `game_similar` has
 * rows, this draws no section rather than an empty one.
 *
 * One row rather than Explore's two-row grid: this is a subsection of a detail
 * screen, not a browse surface, and a second row would double its height on an
 * already-long page.
 */
export function SimilarGames({
  gameId,
  onPressGame,
}: {
  gameId: number;
  onPressGame: (id: number) => void;
}) {
  const similar = useSimilarGames(gameId);
  const items = similar.data?.items ?? [];

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Similar Games</Text>

      <FlatList
        horizontal
        data={items}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.row}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <GameTile
            id={item.id}
            title={item.name}
            subtitle={summarySubtitle(item)}
            coverImageId={item.coverImageId}
            onPress={onPressGame}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingBottom: 32 },
  // Matches GameShelf's heading, so a shelf title and a section title agree.
  title: { ...Type.headline, color: PlatformColor("label"), paddingHorizontal: 16 },
  row: { gap: 12, paddingHorizontal: 16 },
});
```

- [ ] **Step 2: Wire it into the detail screen**

In `apps/mobile/src/features/game/game-detail-screen.tsx`, add the import:

```tsx
import { SimilarGames } from "@/features/game/similar-games";
```

Change the signature to take the callback:

```tsx
/**
 * `onOpenGame` rather than a path: typed routes make `Href` a union of
 * template-literal types, so each tab's route file builds its own literal push
 * and this screen stays ignorant of the router. Every tab has its own copy of
 * this route so a push stays inside the current tab.
 */
export function GameDetailScreen({ onOpenGame }: { onOpenGame: (id: number) => void }) {
```

Insert the section between `<DetailRows />` and `<IgdbAttribution />`:

```tsx
            <DetailRows game={data} />

            <SimilarGames gameId={gameId} onPressGame={onOpenGame} />

            <IgdbAttribution slug={data.slug} />
```

- [ ] **Step 3: Update the three route files**

`apps/mobile/src/app/(tabs)/(home)/game/[id].tsx`:

```tsx
import { useRouter } from "expo-router";
import { useCallback } from "react";

import { GameDetailScreen } from "@/features/game/game-detail-screen";

export default function HomeGameDetail() {
  const router = useRouter();
  // A literal, not an interpolated base path: typed routes make `Href` a union
  // of template-literal types. `useCallback` because GameTile is memoised on
  // `onPress`.
  const openGame = useCallback((id: number) => router.push(`/game/${id}`), [router]);

  return <GameDetailScreen onOpenGame={openGame} />;
}
```

`apps/mobile/src/app/(tabs)/explore/game/[id].tsx`:

```tsx
import { useRouter } from "expo-router";
import { useCallback } from "react";

import { GameDetailScreen } from "@/features/game/game-detail-screen";

export default function ExploreGameDetail() {
  const router = useRouter();
  const openGame = useCallback((id: number) => router.push(`/explore/game/${id}`), [router]);

  return <GameDetailScreen onOpenGame={openGame} />;
}
```

`apps/mobile/src/app/(tabs)/search/game/[id].tsx`:

```tsx
import { useRouter } from "expo-router";
import { useCallback } from "react";

import { GameDetailScreen } from "@/features/game/game-detail-screen";

export default function SearchGameDetail() {
  const router = useRouter();
  const openGame = useCallback((id: number) => router.push(`/search/game/${id}`), [router]);

  return <GameDetailScreen onOpenGame={openGame} />;
}
```

- [ ] **Step 4: Verify types**

Run: `pnpm --filter mobile check-types`
Expected: no errors. **If a route push fails to type-check**, the literal has drifted from the generated union — read `apps/mobile/.expo/types/router.d.ts` and match it exactly rather than adding a cast.

- [ ] **Step 5: Run the test suite and lint**

Run: `pnpm --filter mobile test && pnpm --filter mobile lint`
Expected: PASS. `test/smoke.test.ts` imports modules; it will catch a broken import path.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src apps/mobile/test
git commit -m "feat(mobile): Similar Games section on the game detail screen

Renders nothing when empty, in flight or failed, so it is safe before
the backfill. Each tab's route file supplies its own literal push, since
typed routes make Href a union of template-literal types."
```

---

## Task 9: Docs, backfill and coverage measurement

**Files:**
- Modify: `README.md` (the `apps/api` route table, and the `apps/mobile` Explore/detail prose)
- Modify: `docs/mobile-device-verification.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing code-facing.

- [ ] **Step 1: Add the route to the README table**

In `README.md`, in the `apps/api` route table, immediately after the `GET /api/games/:id` row:

```markdown
| `GET /api/games/:id/similar?limit=`       | IGDB's `similar_games`, re-ranked; `limit` ≤ 50 (default 12) |
```

- [ ] **Step 2: Document the section in the mobile prose**

In `README.md`, after the **Explore** paragraph in the `apps/mobile` section:

```markdown
**Similar games.** The detail screen closes with a row of IGDB's own
`similar_games`, mirrored into `game_similar` by the nightly sync and served
from `GET /api/games/:id/similar` — its own cacheable route rather than a field
on the detail response, which is `private, no-cache` because it embeds the
caller's backlog entry. The row is absent, not empty, when a game has no
suggestions, so the feature was deployable before the backfill ran. Each tab's
`game/[id].tsx` supplies its own push, so tapping a suggestion stays inside the
current tab.
```

- [ ] **Step 3: Add the device check**

Append to the checklist in `docs/mobile-device-verification.md` (match the file's existing checkbox format):

```markdown
- [ ] **Similar games stay in their tab.** Open Explore → a popular game → a
      game in its Similar Games row → another game in that one's row. The tab
      bar stays visible throughout and Explore stays selected. Back unwinds one
      level at a time.
- [ ] **A game with no suggestions draws no section.** The IGDB attribution
      follows the detail rows directly, with no empty heading above it.
- [ ] **Tiles without cover art show the `gamecontroller` placeholder**, not a
      blank or broken image.
```

- [ ] **Step 4: Commit the docs**

```bash
git add README.md docs/mobile-device-verification.md
git commit -m "docs: similar games route, section and device checks"
```

- [ ] **Step 5: Apply the migration locally**

Run: `pnpm --filter @repo/db db:migrate`
Expected: the `0004` migration applies. Requires the local Postgres from `deps.compose.yaml`.

- [ ] **Step 6: Run the full verification suite**

Run: `pnpm turbo check-types lint test`
Expected: everything passes. This is the gate before the backfill.

- [ ] **Step 7: Confirm IGDB still accepts the field, live**

Run: `pnpm --filter @repo/igdb test:contract`
Expected: PASS. This is the real confirmation that `similar_games` is not deprecated — it needs `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in the root `.env`, and the suite skips silently without them. **If it fails with a 400, stop**: the field has been removed or renamed, and the spec's §11 risk row has fired.

- [ ] **Step 8: Backfill**

Run: `pnpm --filter worker sync --full`

Expected: roughly 748 pages of 500 at 4 requests per second — about three minutes of IGDB time, longer with the database writes. The advisory lock means this cannot collide with the nightly cron. Every write is an upsert, so an interrupted run is safe to repeat.

- [ ] **Step 9: Measure coverage**

Run against the mirror:

```sql
-- global, across all mirrored games
SELECT count(DISTINCT game_id) AS covered FROM game_similar;
SELECT count(*) AS total FROM games;

-- among the games people actually open
SELECT count(*) FROM games g
WHERE g.total_rating_count > 50
  AND EXISTS (SELECT 1 FROM game_similar s WHERE s.game_id = g.id);

SELECT count(*) FROM games WHERE total_rating_count > 50;
```

Record both ratios in the PR description. **The second ratio is the one that matters** — global coverage across 373,590 mostly obscure games is a vanity metric. If popular-game coverage disappoints, that is the trigger to revisit the computed fallback in spec §12, and not before.

- [ ] **Step 10: Sanity-check a real game**

```sql
SELECT g.name, g.total_rating_count
FROM game_similar s
JOIN games g ON g.id = s.similar_game_id
WHERE s.game_id = 1942  -- The Witcher 3: Wild Hunt
ORDER BY g.total_rating_count DESC, g.id ASC
LIMIT 12;
```

Expected: a dozen plausible RPGs, no DLC, no duplicates, and no Witcher 3 itself.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §4 IGDB layer (field, schema, mapper, dedup, self-filter) | 1 |
| §5 mirror table, no FK, no index, `truncateAll`, `persistPage` | 2, 3 |
| §6 `similarGames` query, contracts, cache keys, route | 4, 5, 6 |
| §7 mobile section, render-nothing, query key, navigation | 7, 8 |
| §8 files | all |
| §9 testing | tests inside 1–8; device checks in 9 |
| §10 rollout, backfill, coverage queries | 9 |
| §11 risks — contract test as the deprecation tripwire | 9 step 7 |
| §12 deferred | no task, by design |

No gaps.

**Placeholder scan:** No TBDs, no "add error handling", no "similar to Task N". Every code step carries the actual code. The only deliberately non-literal artefact is the generated migration filename in Task 2 (`0004_*.sql`), where the generator owns the suffix and Step 5 states the expected contents and the one thing to verify.

**Type consistency:**

- `MappedPage.gameSimilar: { gameId, similarGameId }[]` — Task 1 defines it, Task 3 inserts it, both spellings match.
- `schema.gameSimilar` with `gameId` / `similarGameId` — Task 2 defines, Tasks 3, 4, 6 consume.
- `similarGames(db, { gameId, limit }): Promise<GameSummary[]>` — Task 4 defines, Task 6 calls with exactly that shape.
- `SIMILAR_LIMIT_DEFAULT` / `similarQuerySchema` / `SIMILAR_TTL_SECONDS` / `similarKey(version, gameId, limit)` — Task 5 defines, Tasks 6 and 7 consume.
- `keys.games.similar(id, limit)` and `endpoints.similarGames(id, { limit })` — Task 7 defines, Task 8 consumes via `useSimilarGames`.
- `SimilarGames({ gameId, onPressGame })` and `GameDetailScreen({ onOpenGame })` — Task 8 defines both; the screen passes `onOpenGame` into `onPressGame`, which is intentional (the section names its prop after what it does, the screen after where it comes from).
- Test helper named `seedSimilar` in both `packages/db/test/games-queries.test.ts` (Task 4, local) and `apps/api/test/helpers.ts` (Task 6, exported). Same name, different packages, no import conflict.
