# Home Single Backlog Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home loads the backlog once, as one unfiltered query, and derives every status filter from it on the device. Switching filters never touches the network.

**Architecture:** One query key, `["backlog", "list", "all", "updated_at"]`, replaces the per-filter/per-sort family. `toSections` does the filtering that the server used to do. The optimistic mutation patches that single cached list, and the filtered views follow because they are derived from it. Stats stay a separate query.

**Tech Stack:** Expo SDK 58, expo-router, TanStack Query 5 (+ persist client), Vitest (Node, pure modules only).

**Spec:** None written. The decisions were made in conversation on 2026-10-23 and are recorded under Global Constraints.

## Global Constraints

- Branch `feat/mobile-1.3`, shipping in 1.3.0. No version bump.
- `keys.backlog.list()` returns `["backlog", "list", "all", "updated_at"]`, the same shape as before. (A persisted cache does not survive a new build or OTA update anyway: see `BUSTER` in `query-persist.ts`.)
- The server API stays as it is. `GET /api/backlog?status=` remains for older app builds, and `endpoints.listBacklog` keeps its signature. The app just stops passing `status`.
- Stats (`keys.backlog.stats()`, `useBacklogStats`) are unchanged and out of scope.
- The `BACKLOG_SOFT_CAP` (5000) is ignored by decision. Filters derived from a capped list are accepted.
- A truly empty backlog shows the full-screen `emptyBacklog()` state **whatever the filter is**. `emptyFilter(status)` is only for a non-empty backlog with nothing in that status. This is a decided behaviour change.
- Vitest runs in plain Node, so `test/` must not import `react-native` or `@expo/ui`.
- Commands run from `apps/mobile`: `pnpm test`, `pnpm lint`, `pnpm check-types`.
- Match the surrounding comment style: short "why" comments, no restating code.

## Review Focus

1. **A status change while a filter is shown:** the row should leave the filtered view immediately (the patched full list feeds `toSections`) and come back in the right place under All. Pinned by the Task 1 "drops entries of other statuses" test plus the existing `patchBacklogList` re-placement tests.
2. **Relaunching the same build with a persisted cache:** Home must render from disk with no cold load. Pinned in Task 2 by asserting `shouldPersistQuery(keys.backlog.list())`. A new build or OTA update busts the cache by design.
3. **A failed mutation while filtered:** the rollback restores the single list, and the filter view reverts with it. Hook code isn't unit-testable under Node, so this is in the Task 4 device checklist.
4. **A widget deep link to `?status=playing` on a cold launch with no cache:** full-screen loading, then the filtered list with the picker set to Playing. Task 4 checklist.
5. **An empty backlog with a filter in the URL:** the full empty state with its Find/Explore actions, not the per-status empty state. Task 4 checklist.

---

### Task 1: `toSections` filters the full list

**Files:**

- Modify: `apps/mobile/src/features/backlog/sections.ts` (`toSections`, filtered branch)
- Test: `apps/mobile/test/sections.test.ts` (`describe("toSections — filtered")`)

**Interfaces:**

- Produces: `toSections(items: BacklogListItemWire[], filter: BacklogStatus | undefined): BacklogSection[]` (same signature). `items` is now always the **whole** backlog, and a filter keeps only entries with `status === filter`, in input order.

- [ ] **Step 1: Write the failing tests** in the `toSections — filtered` block:
  - `"keeps only entries of the filtered status, in API order"`: input `[entry("playing","A"), entry("waiting"), entry("playing","B")]` with filter `"playing"` gives one section, `count` 2, names `["A","B"]`, `title` null.
  - `"returns no sections when no entry has the filtered status"`: `[entry("waiting")]` with `"abandoned"` gives `[]`.
  - The existing two filtered tests stay as they are. They still hold.
- [ ] **Step 2: Run** `pnpm test sections`. Expected: the first new test FAILs (count 3).
- [ ] **Step 3: Implement.** In the filtered branch, filter `items` by status before building the single headerless section. Update the JSDoc and comment to say the server no longer filters.
- [ ] **Step 4: Run** `pnpm test sections`. Expected: PASS.
- [ ] **Step 5: Commit** with `refactor(mobile): derive Home's status filter from the full backlog in toSections`.

This works on its own: today a filtered list passed in already matches, so the extra filter does nothing until Task 2.

---

### Task 2: One backlog query

**Files:**

- Modify: `apps/mobile/src/api/keys.ts` (`backlog.list`, remove `backlog.lists`)
- Modify: `apps/mobile/src/api/hooks.ts` (`useBacklog`, `useBacklogEntryMutation` `onMutate`/`onError`)
- Modify: `apps/mobile/src/features/backlog/optimistic-list.ts` (`patchBacklogList`, remove `BacklogListFilter`)
- Modify: `apps/mobile/src/query-persist-policy.ts:11`
- Modify: `apps/mobile/src/features/backlog/backlog-screen.tsx:65` (`useBacklog()` call only)
- Modify: `apps/mobile/src/widgets/widget-sync.tsx` (call plus comment)
- Test: `apps/mobile/test/api-keys.test.ts`, `apps/mobile/test/optimistic-list.test.ts`, `apps/mobile/test/query-persist-policy.test.ts`

**Interfaces:**

- Consumes: Task 1's `toSections` filtering.
- Produces:
  - `keys.backlog.list(): readonly ["backlog", "list", "all", "updated_at"]` (no parameters). `keys.backlog.lists` is deleted.
  - `useBacklog(): UseQueryResult<BacklogListResponse>` (no parameters). The query function is `api.listBacklog()`.
  - `patchBacklogList(list, sort, gameId, next, now): BacklogListResponse`, with the `filter` parameter and the "left this filter" branch removed. `next === null` still removes the row.

- [ ] **Step 1: Update the tests first.**
  - `api-keys.test.ts`: replace the "keys the backlog list by its filter" test with `"keys Home's single backlog list"`, which asserts `keys.backlog.list()` equals `["backlog","list","all","updated_at"]`.
  - `query-persist-policy.test.ts`: add `"persists the key Home actually reads"`, asserting `shouldPersistQuery(keys.backlog.list(), "success")` is `true`. With the `LIST` literal test already there, this fixes the hash across upgrades.
  - `optimistic-list.test.ts`: delete the two filtered-list tests (around lines 84 and 99) and drop the `"all"` argument from every other call.
- [ ] **Step 2: Run** `pnpm check-types`. Expected: FAIL, because the tests call the new signatures.
- [ ] **Step 3: Implement**, in this order:
  1. In `keys.ts`, make `list()` return the fixed literal and delete `lists()`. Comment: one list for Home; filters are derived on the device; the `"all"`/sort segments are kept so the persisted cache's hash survives the upgrade.
  2. In `optimistic-list.ts`, remove `BacklogListFilter` and the `filter` parameter and branch, and update the JSDoc.
  3. In `hooks.ts`:
     - `useBacklog()` drops its parameters and the now-unused `BacklogSort` and `BacklogStatus` imports, if nothing else uses them.
     - In `onMutate`, cancel `keys.backlog.list()`, read it with `getQueryData`, and if it's defined, set it to `patchBacklogList(list, "updated_at", …)`.
     - The stats `from` fallback becomes `list?.items.find(…)?.status`.
     - Return `{ previous, list, stats }`.
     - In `onError`, restore `context.list` when it's defined.
     - Keep the existing "why" comments, reworded from plural to singular.
  4. In `query-persist-policy.ts`, `PERSISTED_KEYS` becomes `[keys.backlog.list(), keys.backlog.stats()]`.
  5. In `backlog-screen.tsx`, use `const backlog = useBacklog();`. `toSections` already gets `filter`.
  6. In `widget-sync.tsx`, call `useBacklog()` and update the comment. Home now observes the same list, but `WidgetSync` stays so the widget doesn't depend on Home being mounted.
- [ ] **Step 4: Run** `pnpm test && pnpm check-types && pnpm lint`. Expected: all pass.
- [ ] **Step 5: Commit** with `refactor(mobile): one backlog query for Home, filters derived on device`.

---

### Task 3: Simplify Home's loading and empty states

With one query, a filter can no longer have a "first load" of its own. That removes the second loading path.

**Files:**

- Modify: `apps/mobile/src/features/backlog/backlog-screen.tsx` (the early returns, `ListEmptyComponent`, `QueryBoundary`)

**Interfaces:**

- Consumes: Task 2's `useBacklog()`.

- [ ] **Step 1: Implement.**
  - The early full-screen `LoadingState`: `if (backlog.isPending) return <LoadingState />;`. Drop the `filter === undefined` guard and its comment about a filter's first load.
  - The empty backlog: `if (backlog.data?.items.length === 0)`, with no `filter` check. Add a comment saying an empty backlog has nothing to filter, so a widget link to a status still lands on the actionable empty state.
  - `ListEmptyComponent`: `filter === undefined ? undefined : <EmptyState {...emptyFilter(filter)} />`, with no `isPending` branch.
  - `QueryBoundary`: remove the `loading={list}` prop. Pending is handled above, so the boundary now only covers error vs. data.
- [ ] **Step 2: Run** `pnpm check-types && pnpm lint && pnpm test`. Expected: all pass, with no unused imports.
- [ ] **Step 3: Commit** with `refactor(mobile): single loading path on Home`.

---

### Task 4: Device verification (human checkpoint)

No code. Run the app on an iPhone simulator, plus iPad for the grid, using the `run` skill or `pnpm ios`.

- [ ] With a network inspector or API logs, switching All → Playing → Waiting → All makes **no** `/api/backlog` request, shows no spinner and no updating pill.
- [ ] While filtered to Playing, change a game to Completed from the row menu. It leaves the list at once. Switch to Completed: it's at the top.
- [ ] Make a change offline or force a failure. The row comes back, and the filter view reverts.
- [ ] Pull to refresh while filtered: the native spinner shows, and there's one `/api/backlog` request with no `status` parameter.
- [ ] Kill and relaunch with a filter in the URL (open a widget deep link): Home renders from the persisted cache instantly.
- [ ] Delete the app and sign in with an empty account, then open `?status=playing` from the widget: you get the full empty state with Find/Explore.
- [ ] On a non-empty account with no Abandoned games, the Abandoned filter shows `emptyFilter("abandoned")`.
