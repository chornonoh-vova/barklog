# Backlog Entry Writes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put each backlog entry write in one deep module on each side of the wire. The server applies it under the free-tier cap. The device applies it optimistically, behind a slot check made at tap time. The device stops keeping a second copy of the counts, and an account switch no longer depends on doing things in a set order.

**Architecture:**

- **Server:** `apps/api/src/backlog/entry-write.ts` owns the transaction that used to be inline in `PUT /api/backlog/:gameId`. A missing `rating` now means "keep it".
- **Device:** `src/features/backlog/entry-writes.ts` is a plain core over a `QueryClient`, the API and an effects object. A thin `useBacklogEntry(gameId)` hook wires real effects into it.
- **Counts:** derived from the one backlog list, so the stats query goes.
- **Recents:** leave the query cache for a store of their own.

**Tech Stack:** Hono, Drizzle, Postgres, Vitest with Testcontainers (api, db). Expo SDK 58, TanStack Query 5, Vitest in plain Node (mobile).

**Spec:** None written. The decisions were made in an architecture-review session on 2026-10-23. They are recorded under Global Constraints, and the vocabulary is in `CONTEXT.md`.

## Global Constraints

- Branch `feat/mobile-1.3`, shipping in 1.3.0. No version bump.
- **The API deploys before any 1.3 build.** Task 5's `move` leaves `rating` out, which an older server reads as "clear it".
- **Rating rule:** in `PUT /api/backlog/:gameId`, a missing `rating` keeps the stored rating, and `rating: null` clears it. A new entry with no `rating` gets `null`. No shipped build (`c1d7133` to `2fa69bd`) leaves `rating` out, so this is backward compatible.
- **Slot check:** runs at tap time from cached data only, with no subscription and no fetch. If the cached `me` or backlog list is missing, it lets the write through. The server's 402 is the backstop, and the flash, rollback and paywall that follow on a cold cache are accepted.
- **Stats:** the device no longer fetches `/api/backlog/stats`. The route stays on the server, untouched, for the planned Stats tab. `BACKLOG_SOFT_CAP` (5000) truncation of the derived counts is accepted.
- **Vocabulary:** use the terms in `CONTEXT.md`: backlog entry write, move, slot, free-tier cap, slot check, entitlement, recents, account switch. In comments, "upsert" is used only for the db query.
- **Mobile tests:** Vitest runs in plain Node. Nothing under `apps/mobile/test` may import `react-native`, `expo-router`, `expo-haptics` or `@expo/ui`. Mock AsyncStorage with the factory form used in `test/storage-flag.test.ts`.
- **Commands:**
  - `apps/mobile`: `pnpm test`, `pnpm lint`, `pnpm check-types`.
  - `apps/api` and `packages/db`: `pnpm test`, `pnpm lint`, `pnpm check-types`. These need Docker for the Postgres and Valkey containers.
- **Comments:** match the surrounding style, which is short "why" comments that don't restate the code. Move the existing "why" comments along with their code instead of rewriting them.

## Review Focus

1. **A free user at the cap moves a game on a cold cache,** for example a detail opened from a share link. The new status shows briefly, then rolls back, and the paywall opens with no alert. Pinned in Task 5 by `"a 402 rolls back and opens the paywall without an alert"`.
2. **A rated game is moved from the detail screen while the list is cold.** The server keeps the rating and the detail cache still shows it. Pinned in Task 1 (db), Task 2 (HTTP `"a move without rating keeps it"`) and Task 5 (`"a move keeps the cached rating and sends no rating"`).
3. **`/me` isn't cached yet, with all slots used.** The write goes through and nothing refuses it on the device. Pinned in Task 5 by `"an unknown entitlement never blocks"`.
4. **Re-rating at the cap on a free account.** It's never blocked, on either side. Pinned in Task 2 (moved test `"a full free tier can still change a rating"`) and Task 5 (`"re-rating at the cap is never blocked"`).
5. **An account switch while Search is mounted.** The last user's recents leave the screen at once. Pinned in Task 6 by `"clearing notifies subscribers synchronously"`.

---

### Task 1: The upsert query keeps a rating that isn't given

**Files:**

- Modify: `packages/db/src/queries/backlog.ts:121-147` (`upsertBacklogEntry`)
- Test: `packages/db/test/backlog-queries.test.ts`
- Add: `CONTEXT.md` (already written, uncommitted)

**Interfaces:**

- Produces: `upsertBacklogEntry(db: Queryable, input: { userId: string; gameId: number; status: BacklogStatusValue; rating?: number | null }): Promise<{ entry: BacklogEntry; created: boolean }>`. With `rating === undefined`, an insert stores `null` and a conflict update leaves `rating` out of `set`.

- [ ] **Step 1: Write the failing tests** in `backlog-queries.test.ts`:
  - `"a write without rating keeps the stored rating"`: upsert `{status:"completed", rating:8}`, then `{status:"playing"}` with no rating. Expect `entry.rating` to be `8` and `entry.status` to be `"playing"`.
  - `"a new entry without rating has none"`: upsert `{status:"waiting"}`. Expect `entry.rating` to be `null` and `created` to be `true`.
  - The existing `"a rating can be cleared by writing null"` stays as it is.
- [ ] **Step 2: Run** `pnpm test backlog-queries` in `packages/db`. Expected: FAIL. The type error, or the stored rating being `null`.
- [ ] **Step 3: Implement.** Make `rating` optional. The insert uses `input.rating ?? null`. The `set` spreads `rating` only when `input.rating !== undefined`, and `updatedAt` stays.
- [ ] **Step 4: Run** `pnpm test`, `pnpm check-types` and `pnpm lint` in `packages/db`. Expected: PASS.
- [ ] **Step 5: Commit** `CONTEXT.md` and the change with the message `feat(db): a backlog upsert without rating keeps the stored one`.

---

### Task 2: The server's backlog entry write module

**Files:**

- Create: `apps/api/src/backlog/entry-write.ts`
- Modify: `apps/api/src/routes/backlog.ts:62-125` (the PUT handler)
- Modify: `packages/contracts/src/backlog.ts:20` (doc comment on `backlogUpsertSchema` only)
- Create: `apps/api/test/backlog-entry-write.test.ts`
- Modify: `apps/api/test/backlog-cap.test.ts` (keep the HTTP-only tests, move the rest)

**Interfaces:**

- Consumes: Task 1's optional `rating`.
- Produces:

  ```ts
  export type EntryWriteOutcome =
    | { kind: "saved"; entry: BacklogEntry; created: boolean }
    | { kind: "capped"; activeCount: number; toFree: number }
    | { kind: "unknown-game" };

  export async function writeBacklogEntry(
    db: Db,
    input: { userId: string; gameId: number; status: BacklogStatus; rating?: number | null },
    now: Date,
  ): Promise<EntryWriteOutcome>;
  ```
  - `Db` comes from `../types.js` and `BacklogEntry` from `@repo/db`.
  - `toFree` is `activeCount - FREE_ACTIVE_SLOTS + 1`.
  - The `gameExists` check, the transaction and the READ COMMITTED comment all move here unchanged. `now` replaces the inline `new Date()` passed to `isPremium`.

- [ ] **Step 1: Write the failing module tests** in `backlog-entry-write.test.ts`.
  - **Setup:** use `createTestApp()` for its `db` and `reset`. Seed with `seedGame` and `ensureUser` as `backlog-cap.test.ts` does, and keep its `grantPremium` and `fillSlots` helpers, rewritten to call `writeBacklogEntry`.
  - **Moved from `backlog-cap.test.ts`,** with each call to the module and assertions on `kind`, `created`, `activeCount` and `toFree` in place of status codes:
    - "a blocked add writes nothing"
    - "finishing a game frees a slot…"
    - "a full free tier can still finish a game…"
    - "…move between two unfinished statuses"
    - "…change a rating"
    - "reopening a finished game is blocked…"
    - "a finished game can always be logged…"
    - "a premium user is never blocked"
    - "an expired subscription is back to the free tier"
    - "the cap counts one user's entries only"
    - "two concurrent adds at the boundary cannot both win"
  - **The concurrency test** uses `Promise.all` of two `writeBacklogEntry` calls. Expect the sorted kinds to be `["capped","saved"]`, and `listBacklog` to return `FREE_ACTIVE_SLOTS` rows.
  - **New tests:**
    - `"an unknown game is reported, not written"`, which expects `{ kind: "unknown-game" }`.
    - `"a lapsed subscriber above the cap is told the real distance back"`, which expects `capped` with `activeCount: GAME_COUNT - 1` and `toFree: GAME_COUNT - FREE_ACTIVE_SLOTS`.
- [ ] **Step 2: Run** `pnpm test backlog-entry-write` in `apps/api`. Expected: FAIL, because the module doesn't exist.
- [ ] **Step 3: Implement `writeBacklogEntry`** in `entry-write.ts`.
- [ ] **Step 4: Rewire the PUT handler.** It calls `writeBacklogEntry(deps.db, { userId, gameId, status, rating }, new Date())`, passing `rating` through and no longer `rating ?? null`. It maps the outcomes this way:
  - `unknown-game`: `GAME_NOT_FOUND`, with the existing detail.
  - `capped`: `BACKLOG_CAP_REACHED`, with the existing two detail strings and extensions, built from `outcome.activeCount` and `outcome.toFree`.
  - `saved`: `toBacklogEntry`, with 201 or 200 as now.

  Drop the imports the route no longer uses.

- [ ] **Step 5: Reduce `backlog-cap.test.ts` to the HTTP shape.** Keep `"a free user fills every slot, and the next unfinished add is 402"` and the lapsed-subscriber test, which pins the `Finish N` copy and `code`. Add `"a move without rating keeps it"`: PUT `{status:"completed", rating:8}` to game 1, then `{status:"playing"}`. Expect 200 and a body matching `{ status: "playing", rating: 8 }`.
- [ ] **Step 6: Document the rule** in the comment above `backlogUpsertSchema`: "`rating` left out keeps the stored rating; `null` clears it."
- [ ] **Step 7: Run** `pnpm test`, `pnpm check-types` and `pnpm lint` in `apps/api`, then `pnpm check-types` in `packages/contracts`. Expected: PASS. That includes `backlog-routes.test.ts` as it is.
- [ ] **Step 8: Commit** with `refactor(api): backlog entry write module owns the free-tier cap`.

---

### Task 3: One entitlement read for `/me` and `/subscription/refresh`

**Files:**

- Modify: `apps/api/src/entitlement.ts`
- Modify: `apps/api/src/routes/me.ts`, `apps/api/src/routes/subscription.ts`
- Test: `apps/api/test/entitlement.test.ts`

**Interfaces:**

- Produces: `readEntitlement(db: Queryable, userId: string, now: Date): Promise<MeResponse>`. It returns `{ premium: isPremium(row, now), entitlement: row === null ? null : toEntitlement(row) }`. `MeResponse` comes from `@repo/contracts`.

- [ ] **Step 1: Write the failing tests** in `entitlement.test.ts`, using the `createTestApp()` db and `upsertSubscription`:
  - `"no subscription reads as free with no entitlement"`, which expects `{ premium: false, entitlement: null }`.
  - `"an active subscription reads as premium with its wire entitlement"`. Use an `expiresAt` after `now`, and expect `entitlement.expiresAt` to be the ISO string.
- [ ] **Step 2: Run** `pnpm test entitlement` in `apps/api`. Expected: FAIL.
- [ ] **Step 3: Implement** `readEntitlement`. Both routes then `return c.json(await readEntitlement(deps.db, userId, new Date()))` and keep their `Cache-Control` headers.
- [ ] **Step 4: Run** `pnpm test`, `pnpm check-types` and `pnpm lint` in `apps/api`. Expected: PASS, with `me-routes.test.ts` and `subscription-refresh.test.ts` unchanged.
- [ ] **Step 5: Commit** with `refactor(api): one entitlement read for /me and subscription refresh`.

---

### Task 4: Counts come from the backlog list

**Files:**

- Modify: `apps/mobile/src/features/backlog/slots.ts`
- Modify: `apps/mobile/src/features/backlog/use-slot-state.ts` (temporary, deleted in Task 5)
- Modify: `apps/mobile/src/features/backlog/backlog-screen.tsx` (stats query, pill, pull-to-refresh)
- Modify: `apps/mobile/src/review/use-review-prompt.ts`
- Modify: `apps/mobile/src/api/hooks.ts` (delete `useBacklogStats`, plus the stats cancel, patch and rollback in `useBacklogEntryMutation`)
- Modify: `apps/mobile/src/features/backlog/optimistic-list.ts` (delete `patchBacklogStats`)
- Modify: `apps/mobile/src/api/endpoints.ts` (delete `getBacklogStats`)
- Modify: `apps/mobile/src/api/keys.ts` (delete `backlog.stats`, and update the `me` and `backlog` comments)
- Modify: `apps/mobile/src/query-persist-policy.ts:11`
- Test: `test/slots.test.ts`, `test/optimistic-list.test.ts`, `test/api-keys.test.ts`, `test/api-endpoints.test.ts`, `test/query-persist-policy.test.ts`

**Interfaces:**

- Produces:
  - `activeSlotsUsed(items: readonly BacklogListItemWire[]): number`, which counts items whose status is in `SLOT_CONSUMING_STATUSES`.
  - `countStatus(items: readonly BacklogListItemWire[], status: BacklogStatus): number`.
  - `slotsLabel(items: readonly BacklogListItemWire[] | undefined, premium: boolean): string | null`, with the same copy as now.
  - `PERSISTED_KEYS` is `[keys.backlog.list()]`.

- [ ] **Step 1: Update the tests first.**
  - `slots.test.ts`: replace the `stats()` and `onlyOne()` builders with list builders. `items(waiting, playing)` gives that many entries plus 12 `completed` and 3 `abandoned`. Every existing assertion stays. Add `"countStatus counts one status only"`.
  - `optimistic-list.test.ts`: delete the `patchBacklogStats` tests.
  - `api-keys.test.ts`: delete the stats test.
  - `api-endpoints.test.ts`: delete `"fetches stats"`.
  - `query-persist-policy.test.ts`: the persisted-keys test becomes `"persists Home's list only"`. It asserts the list is persisted and `["backlog","stats"]` is not, and drops the stats `gcTime` expectation.
- [ ] **Step 2: Run** `pnpm check-types` in `apps/mobile`. Expected: FAIL on the new signatures.
- [ ] **Step 3: Implement.**
  - `useSlotState` reads `useBacklog().data?.items` in place of the stats. This is temporary: the detail screen subscribes to the list until Task 5 deletes this hook.
  - **Home:** `slotsLabel(backlog.data?.items, premium)`. The pill uses `isFetching: backlog.isFetching`, and pull-to-refresh awaits `backlog.refetch()` alone.
  - **Review prompt:** `const completed = data === undefined ? undefined : countStatus(data.items, "completed")`, with `data` from `useBacklog()`. Update the latch comment, so it says every backlog write invalidates the list.
  - **Mutation:** remove `stats` from the `onMutate` cancels and its return, the `from` fallback and `onError`.
- [ ] **Step 4: Run** `pnpm test`, `pnpm check-types` and `pnpm lint`. Expected: PASS. Then run `grep -rn "stats" apps/mobile/src`. Expected: only comments about the server route, if any.
- [ ] **Step 5: Commit** with `refactor(mobile): derive backlog counts from the list, drop the stats query`.

---

### Task 5: The device's backlog entry write module

**Files:**

- Create: `apps/mobile/src/features/backlog/entry-writes.ts`
- Modify: `apps/mobile/src/api/hooks.ts` (replace `useBacklogEntryMutation`, `useUpsertBacklogEntry` and `useDeleteBacklogEntry` with `useBacklogEntry`)
- Modify: `apps/mobile/src/api/endpoints.ts:52-56` (`rating` optional, and left out of the body when `undefined`)
- Modify: `apps/mobile/src/features/backlog/backlog-game-row.tsx` (drop the `premium` and `activeCount` props, the slot check, the router and the `entry.rating` passing; rewrite the spec §3.4 JSDoc)
- Modify: `apps/mobile/src/features/game/entry-actions.tsx` (drop `premium`, `activeCount` and `onBlocked`; take `onMove(status)` and `onRate(rating)`)
- Modify: `apps/mobile/src/features/game/game-detail-screen.tsx` (drop `useSlotState` and the `/paywall` push)
- Modify: `apps/mobile/src/features/backlog/backlog-screen.tsx` (drop `useSlotState` and the row props)
- Delete: `apps/mobile/src/features/backlog/use-slot-state.ts`
- Create: `apps/mobile/test/entry-writes.test.ts`
- Modify: `apps/mobile/test/api-endpoints.test.ts`

**Interfaces:**

- Consumes: `activeSlotsUsed(items)` from Task 4, `wouldExceedSlots` (unchanged), `patchBacklogList` (unchanged), `shouldPlayStatusHaptic` (unchanged).
- Produces:
  ```ts
  export interface EntryWriteEffects {
    openPaywall(): void;
    alertError(error: unknown): void;
    playStatusHaptic(): void;
  }
  export interface EntryWrites {
    move(gameId: number, status: BacklogStatus): Promise<void>;
    rate(gameId: number, status: BacklogStatus, rating: number | null): Promise<void>;
    remove(gameId: number): Promise<void>;
  }
  export function createEntryWrites(
    queryClient: QueryClient,
    api: Pick<Endpoints, "upsertBacklogEntry" | "deleteBacklogEntry">,
    effects: EntryWriteEffects,
  ): EntryWrites;
  ```
  `useBacklogEntry(gameId: number): { move(status): void; rate(status, rating): void; remove(): void }` lives in `hooks.ts`. It memoises `createEntryWrites` over `useQueryClient()`, `useApi()` and the real effects: `router.push("/paywall")`, `alertOnMutationError` and `notificationAsync(Success)`.
  `upsertBacklogEntry(gameId, input: { status: BacklogStatus; rating?: number | null })` sends `{ status }` alone when `rating` is `undefined`.

**How the core behaves** (this is what the tests pin):

- **The slot check** runs before anything else, from `queryClient.getQueryData(keys.me())?.premium`, the cached list's `activeSlotsUsed`, and `from`. `from` is the cached detail's `backlogEntry?.status` when the detail is cached, otherwise the list item's status, otherwise `null`. If `wouldExceedSlots` says yes, call `effects.openPaywall()` and stop: no cache change and no request.
- **Each write runs as a mutation** through `new MutationObserver(queryClient, options).mutate(input)`. That way it uses the client's mutation defaults (`retry: false`) and network mode, the same as `useMutation`. The returned promise never rejects, so `.catch` it.
- **`onMutate`** keeps today's logic minus stats: cancel the detail and the list, patch the detail entry and the list with `patchBacklogList`, then play the haptic if `shouldPlayStatusHaptic(previous?.status, status)`. For `move`, the cached entry's rating fills the optimistic `{status, rating}` (`null` for a new entry), and the request leaves `rating` out. For `remove`, the change is `null` and no haptic plays.
- **`onError`** rolls back the detail and the list. A 402 calls `openPaywall()` and invalidates `keys.me()`, because a refusal means the cached entitlement or count was wrong. Any other error calls `alertError(error)`.
- **`onSettled`** invalidates the detail and `keys.backlog.all`. Move today's "why" comments with the code.

- [ ] **Step 1: Write the failing tests** in `entry-writes.test.ts`.
  - **Setup:** a real `createQueryClient()`, a fake `api` that records calls and resolves or rejects as each test sets, and a recorder for effects. Seed `keys.me()`, `keys.backlog.list()` and `keys.games.detail(id)` with `setQueryData` as each test needs.
  - `"a move keeps the cached rating and sends no rating"`: seed the detail with `{status:"completed", rating:8}`, then `move(1,"abandoned")`. The api is called with `(1, { status: "abandoned" })`, and the detail cache shows `{ status: "abandoned", rating: 8 }`.
  - `"a move patches the cached list at tap time"`: while the api promise is still pending, the list item already has the new status.
  - `"a slot-consuming move at the cap opens the paywall and writes nothing"`: `me.premium` is `false`, the list has `FREE_ACTIVE_SLOTS` waiting entries, and the move adds game 99 as `"playing"`. Expect `openPaywall` called once, the api not called, and the caches unchanged.
  - `"an unknown entitlement never blocks"`: same as the previous test but with no `me` cached. Expect the api to be called and `openPaywall` not called.
  - `"a cold list never blocks"`: `me.premium` is `false`, no list is cached, and a detail for a new game is cached. Expect the api to be called.
  - `"re-rating at the cap is never blocked"`: full slots, then `rate(1, "waiting", 7)` on a waiting entry. The api is called with `{ status: "waiting", rating: 7 }`.
  - `"a 402 rolls back and opens the paywall without an alert"`: the api rejects with an `ApiError` of status 402. The list and detail are restored to their seeded values, `openPaywall` is called once, `alertError` is not called, and `keys.me()` is invalidated (`queryClient.getQueryState(keys.me())?.isInvalidated` is `true`).
  - `"any other failure rolls back and alerts"`: the api rejects with a 500 `ApiError`. Expect a rollback, `alertError` called once, and `openPaywall` not called.
  - `"the haptic plays at apply time on a status change, not on a re-rate"`: a `move` with a different status records `playStatusHaptic` before the api resolves. A `rate` with the same status doesn't.
  - `"remove drops the row and plays no haptic"`.
  - **In `api-endpoints.test.ts`:** add `"leaves rating out of a move"`. `upsertBacklogEntry(1942, { status: "playing" })` sends `body` `{ status: "playing" }`, asserted with `toStrictEqual`.
- [ ] **Step 2: Run** `pnpm test entry-writes api-endpoints` in `apps/mobile`. Expected: FAIL, because the module doesn't exist.
- [ ] **Step 3: Implement `createEntryWrites`** in `entry-writes.ts`. Keep it free of `react-native`, `expo-*` and `react` imports.
- [ ] **Step 4: Implement `useBacklogEntry`** in `hooks.ts` and delete the three old hooks.
- [ ] **Step 5: Rewire the callers.**
  - `BacklogGameRow`: `setStatus(next)` returns early if `next === entry.status`, otherwise calls `move(next)`. `remove` comes from the same hook.
  - `EntryActions`: the status picker calls `onMove(next)`, and the rating picker calls `onRate(selection)`.
  - The detail screen takes `const writes = useBacklogEntry(gameId)` and passes `onMove={writes.move}` and `onRate={(rating) => writes.rate(status, rating)}`, with `status` from `data.backlogEntry`. The rating picker only renders when a status exists. The toolbar's remove calls `writes.remove()`.
  - Delete `use-slot-state.ts`. On Home, `slotsLabel` keeps `useIsPremium()`.
- [ ] **Step 6: Run** `pnpm test`, `pnpm check-types` and `pnpm lint`. Expected: PASS. Then run `grep -rn 'router.push("/paywall")' apps/mobile/src`. Expected: only `hooks.ts` (the effects) and `backlog-screen.tsx` (the slots label).
- [ ] **Step 7: Device check** on a development build:
  - On a free account at the cap, change a waiting game to playing from a Home row and from the detail: no change. Then from a detail opened through a share link on a cold launch: the paywall opens.
  - Move a rated game from the detail: the rating stays after the refetch.
  - Re-rate at the cap: it saves.
- [ ] **Step 8: Commit** with `refactor(mobile): backlog entry write module owns the slot check and optimistic cache`.

---

### Task 6: Recents leave the query cache

**Files:**

- Modify: `apps/mobile/src/features/search/recents-storage.ts` (rewrite)
- Modify: `apps/mobile/src/app/(tabs)/search/index.tsx`
- Modify: `apps/mobile/src/auth/auth-gate.tsx` (`clearDeviceData` and its ordering comment)
- Modify: `apps/mobile/src/api/keys.ts` (delete `recents`)
- Create: `apps/mobile/test/recents-storage.test.ts`
- Modify: `apps/mobile/test/api-keys.test.ts` (delete the recents key test, if present)

**Interfaces:**

- Produces:
  - `useRecents(): readonly string[]`, via `useSyncExternalStore`.
  - `recordRecent(query: string): Promise<void>`
  - `clearRecents(): void`
  - None of them take a `QueryClient`. `pushRecent` and `parseRecents` in `recents.ts` are unchanged.
- **Store behaviour:**
  - Module state holds the current list.
  - One load-once promise reads AsyncStorage behind the existing `writes` queue.
  - `recordRecent` waits for the load and then pushes, so a search made before the load adds to the stored list.
  - `clearRecents` sets `[]`, notifies subscribers synchronously, and queues the disk removal. A load that was already in flight must not bring the cleared list back.
  - Disk failures are swallowed.

- [ ] **Step 1: Write the failing tests** in `recents-storage.test.ts`, mocking AsyncStorage as `storage-flag.test.ts` does, and calling `vi.resetModules()` per test for fresh module state:
  - `"a search made before the stored list loads adds to it"`: `getItem` resolves `'["zelda"]'`, then `await recordRecent("mario")`. The snapshot is `["mario","zelda"]`, and `setItem` was called with that JSON.
  - `"clearing notifies subscribers synchronously"`: subscribe, `clearRecents()`. The listener was called before any `await`, and the snapshot is `[]`.
  - `"a load in flight when cleared does not bring the list back"`: `getItem` is deferred, `clearRecents()` runs, then the deferred read resolves `'["zelda"]'`. The snapshot stays `[]`.
  - `"a failed read starts empty"`: `getItem` rejects, and the snapshot is `[]` after the load.
  - Export the store's `subscribe` and `getSnapshot` for these tests, as `recentsStore`.
- [ ] **Step 2: Run** `pnpm test recents-storage`. Expected: FAIL.
- [ ] **Step 3: Implement** the store. Update the Search route to call `recordRecent(searched)` and `clearRecents()` with no `queryClient`, and drop its `useQueryClient`.
- [ ] **Step 4: Update `AuthGate`.**
  - `clearDeviceData(userId)` calls `clearRecents()`, `clearPersistedCaches(userId)` and `clearWidget()`. Replace the doc comment with one saying they're independent.
  - Delete the "First, so the mounted Search route hears it before `clear()`" comment. The two `if`s may run in either order now.
- [ ] **Step 5: Run** `pnpm test`, `pnpm check-types` and `pnpm lint`. Expected: PASS. Then run `grep -rn "keys.recents\|clearRecents(queryClient" apps/mobile/src`. Expected: no matches.
- [ ] **Step 6: Device check:** search for something, switch accounts with Search mounted, and come back to Search. The recents are empty.
- [ ] **Step 7: Commit** with `refactor(mobile): recents get their own store, so an account switch needs no ordering`.

---

### Task 7: One entitlement refresh after a purchase

**Files:**

- Modify: `apps/mobile/src/purchases/refresh.ts`
- Modify: `apps/mobile/src/purchases/provider.tsx:58`, `apps/mobile/src/app/paywall.tsx:33-36`
- Create: `apps/mobile/test/refresh-entitlement.test.ts`

**Interfaces:**

- Produces: `refreshEntitlement(api: Pick<Endpoints, "refreshSubscription">, queryClient: QueryClient): Promise<void>`. It awaits `refreshSubscription(api)`, then invalidates `keys.me()`. It never rejects.

- [ ] **Step 1: Write the failing tests,** using `vi.stubGlobal("__DEV__", false)` and a real `createQueryClient()` seeded with `keys.me()`:
  - `"invalidates me only after the server has re-read"`: the api's `refreshSubscription` is deferred. `me` isn't invalidated before the deferred resolves, and is invalidated after.
  - `"invalidates me even when both refresh attempts fail"`, with fake timers advanced by `2_000`.
  - `"leaves the backlog alone"`: the seeded `keys.backlog.list()` isn't invalidated.
- [ ] **Step 2: Run** `pnpm test refresh-entitlement`. Expected: FAIL.
- [ ] **Step 3: Implement** `refreshEntitlement`.
  - The provider's listener calls `void refreshEntitlement(api, queryClient)`.
  - The paywall's `settle` calls `void refreshEntitlement(api, queryClient)` and then `router.back()`. Keep its long "why" comment, adjusted for the dropped `backlog.all` invalidation: nothing under `backlog` depends on entitlement now that stats are gone.
- [ ] **Step 4: Run** `pnpm test`, `pnpm check-types` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5: Commit** with `refactor(mobile): one entitlement refresh for the paywall and the purchase listener`.
