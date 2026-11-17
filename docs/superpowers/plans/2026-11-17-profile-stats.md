# Profile Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Stats section on the Profile tab: total in the header, one tappable row per status that opens Home filtered to it, an average-rating row, and a "Find games to add" row when the backlog is empty.

**Architecture:** A pure helper derives counts and the average from `useBacklog()` items (ADR-0003) and builds row text and spoken labels. A `StatsSection` component renders it inside `ProfileScreen`'s `Form`; navigation is handed in as callbacks and wired in the Profile route to the `?status=` route widgets already use.

**Tech Stack:** Expo Router, `@expo/ui` 58 SwiftUI (`Section`, `Button`, `HStack`, `Text`), TanStack Query, i18next via `@repo/i18n`, Jest + RNTL (mobile), Vitest (`@repo/i18n`).

**Spec:** [docs/superpowers/specs/2026-11-17-profile-stats-design.md](../specs/2026-11-17-profile-stats-design.md)

## Global Constraints

- Stats derive from the backlog list query (`useBacklog`); no new request, no server change.
- Stats stay off Home.
- Section order: account group → **Stats** → (Release alerts, #83) → Barklog section → Sign Out → Delete Account.
- Every row carries one explicit `accessibilityLabel`; tile symbols are never read.
- Plurals via i18next count forms; `packages/i18n/test/copy.test.ts` must pass for all five languages (en, uk, ru, de, es).
- Average: mean of non-null `rating` (1–10), one decimal, formatted with `formatLocale()` (`7.3` en, `7,3` de); hidden when no game is rated.
- Section absent while the backlog has no data (loading, or failed with nothing cached).
- Tiles: waiting `systemGray` `clock.fill`; playing `systemBlue` `gamecontroller.fill`; completed `systemGreen` `checkmark.seal.fill`; abandoned `systemBrown` `xmark.bin.fill`; average `systemYellow` `star.fill`; empty CTA `systemBlue` `gamecontroller.fill`.
- Status rows in `BACKLOG_STATUSES` order, zero counts included and tappable.
- Run mobile commands from `apps/mobile`: `pnpm test`, `pnpm lint`, `pnpm check-types`.

## Review Focus

1. **Cached backlog plus a failed refetch** — TanStack keeps `data` with `isError`; the section must still show (it keys off `data`, not `status`). Test in Task 3.
2. **Tapping a status while Home already has another filter** — Home must switch to the tapped status, not keep the old one. Route test in Task 4.
3. **Every rated game has the same rating** — shows `7.0`, never `7` or `7.000…`. Test in Task 2.
4. **Large backlogs** — counts are digit-grouped (`1,234 games`) via `{{count, number}}`. Test in Task 2.
5. **Backlog emptied while Profile is open** — after the last entry is removed and the query refetches, the CTA replaces the rows. Test in Task 3 (re-render with an empty list).

---

### Task 1: Copy in all five languages

**Files:**

- Modify: `packages/i18n/src/locales/{en,uk,ru,de,es}/app.json`

**Interfaces:**

- Produces keys: `game.gamesCount_*` (restored), `profile.stats.title`, `profile.stats.averageRating`, `profile.stats.averageRatingSpoken` (`{{rating}}`, `{{max}}`), `profile.stats.findGames`, `profile.stats.emptyFooter`.

- [ ] **Step 1: Restore `game.gamesCount_*`** next to `ratingsCount_*` in each locale, exactly as removed in `b6eea1b` (`git show b6eea1b -- apps/mobile/src/i18n/locales`). Do not restore `averageRating`/`averageRatingSpoken` under `game`.

- [ ] **Step 2: Add a `stats` object inside `profile`** with this copy (match each locale's existing form of address):

| key                   | en                                                   | de                                                                  | es                                                               | ru                                                     | uk                                                    |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| `title`               | Stats                                                | Statistik                                                           | Estadísticas                                                     | Статистика                                             | Статистика                                            |
| `averageRating`       | Average rating                                       | Durchschnittsbewertung                                              | Valoración media                                                 | Средняя оценка                                         | Середня оцінка                                        |
| `averageRatingSpoken` | Average rating {{rating}} out of {{max}}             | Durchschnittsbewertung {{rating}} von {{max}}                       | Valoración media {{rating}} de {{max}}                           | Средняя оценка {{rating}} из {{max}}                   | Середня оцінка {{rating}} з {{max}}                   |
| `findGames`           | Find games to add                                    | Spiele zum Hinzufügen finden                                        | Buscar juegos para añadir                                        | Найти игры                                             | Знайти ігри                                           |
| `emptyFooter`         | Your stats show up here once your backlog has games. | Deine Statistik erscheint hier, sobald dein Backlog Spiele enthält. | Tus estadísticas aparecerán aquí cuando tu backlog tenga juegos. | Статистика появится здесь, когда в бэклоге будут игры. | Статистика з'явиться тут, коли в беклозі будуть ігри. |

- [ ] **Step 3: Verify** — `pnpm --filter @repo/i18n test` → PASS (key parity, plural categories, placeholders). Then `pnpm --filter @repo/i18n build` so the mobile app sees the keys.

- [ ] **Step 4: Commit** — `feat(i18n): copy for Profile stats (#82)`

### Task 2: Stats helper

**Files:**

- Create: `apps/mobile/src/features/profile/backlog-stats.ts`
- Test: `apps/mobile/src/features/profile/backlog-stats.test.ts`
- Modify: `apps/mobile/src/features/profile/settings-icon.tsx` (add `"systemBrown" | "systemYellow"` to `TileColor`)
- Modify: `packages/contracts/src/wire.ts` (delete unused `BacklogStatsWire`)

**Interfaces:**

- Consumes: `countStatus(items, status)` from `@/features/backlog/slots`; `statusLabel(status)` from `@/features/game/format`; `BACKLOG_STATUSES`, `RATING_MAX` from `@repo/contracts`; `formatLocale`, `i18n` from `@/lib/i18n/instance`.
- Produces:

  ```ts
  export type BacklogStats = {
    total: number;
    counts: Record<BacklogStatus, number>;
    averageRating: number | null;
  };
  export function backlogStats(items: readonly BacklogListItemWire[]): BacklogStats;
  export function statsTitle(total: number): string; // "Stats · 42 games"
  export type StatusStatsRow = {
    status: BacklogStatus;
    title: string;
    value: string;
    accessibilityLabel: string;
    icon: SFSymbol;
    color: TileColor;
  };
  export function statusRows(stats: BacklogStats): StatusStatsRow[];
  export function averageRatingRow(
    averageRating: number | null,
  ): { title: string; value: string; accessibilityLabel: string } | null;
  ```

- [ ] **Step 1: Write the failing tests** (build items with `backlogItem(id, status, { rating })` from `@test/fixtures`):
  - `backlogStats` counts each status and the total: 2 waiting, 1 playing → `{ total: 3, counts: { waiting: 2, playing: 1, completed: 0, abandoned: 0 } }`.
  - `backlogStats` averages only rated games: ratings `7, 8, 7, null` → `averageRating` ≈ `7.333` (`toBeCloseTo`); all `null` → `null`; `[]` → `{ total: 0, averageRating: null }`.
  - `statsTitle(1)` → `"Stats · 1 game"`; `statsTitle(1234)` → `"Stats · 1,234 games"`.
  - `statusRows` returns four rows in `BACKLOG_STATUSES` order; waiting row with 18 → `{ title: "Waiting", value: "18", accessibilityLabel: "Waiting, 18 games", icon: "clock.fill", color: "systemGray" }`; playing with 1 → label `"Playing, 1 game"`; a zero-count status is still present with value `"0"`.
  - `averageRatingRow(22 / 3)` → `{ title: "Average rating", value: "★ 7.3", accessibilityLabel: "Average rating 7.3 out of 10" }`; `averageRatingRow(7)` → value `"★ 7.0"`; `averageRatingRow(null)` → `null`.
  - In Ukrainian (switch language as `src/lib/i18n/instance.test.ts` does, restore English after): `statsTitle(3)` contains `"3 гри"`; in German `averageRatingRow(22 / 3)!.value` → `"★ 7,3"`.

- [ ] **Step 2: Run** `pnpm test -- backlog-stats` from `apps/mobile` → FAIL (module not found).

- [ ] **Step 3: Implement** the signatures above. Format the rating once with `new Intl.NumberFormat(formatLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })` and use that string in both value and spoken label (`max: RATING_MAX`). Counts in `value` use `Intl.NumberFormat(formatLocale())`. The spoken status label is `` `${statusLabel(status)}, ${i18n.t("game.gamesCount", { count })}` ``. Symbol/colour per Global Constraints, as a `Record<BacklogStatus, …>` in this file. Delete `BacklogStatsWire`.

- [ ] **Step 4: Run** `pnpm test -- backlog-stats` → PASS; `pnpm check-types` → clean; `pnpm --filter @repo/contracts check-types` → clean.

- [ ] **Step 5: Commit** — `feat(mobile): derive Profile stats from the backlog query (#82)`

### Task 3: Stats section on the Profile screen

**Files:**

- Create: `apps/mobile/src/features/profile/stats-section.tsx`
- Modify: `apps/mobile/src/features/profile/profile-screen.tsx` (new props; render after the account `Section`; update the section-order doc comment)
- Test: `apps/mobile/src/features/profile/profile-screen.test.tsx`

**Interfaces:**

- Consumes: Task 2's helper; `useBacklog` from `@/lib/api/hooks`; `SettingsIcon`, `Chevron`, `ActionRow`/`NavigationRow`, `ROW`, `ROW_SHAPE`, `PRIMARY`, `SECONDARY`.
- Produces:

  ```ts
  export function StatsSection(props: {
    onOpenStatus: (status: BacklogStatus) => void;
    onFindGames: () => void;
  }): ReactElement | null;
  // ProfileScreen gains the same two props.
  ```

- [ ] **Step 1: Write the failing tests** in a `describe("Stats", …)` block. Extend `renderScreen` to take `listBacklog` and pass the two new callbacks as `jest.fn()`s:
  - With `backlogList(backlogItem(1, "waiting", { rating: 8 }), backlogItem(2, "waiting"), backlogItem(3, "playing", { rating: 6 }))`: header text `"Stats · 3 games"` (role `header`); buttons named `"Waiting, 2 games"`, `"Playing, 1 game"`, `"Completed, 0 games"`, `"Abandoned, 0 games"`; pressing `"Playing, 1 game"` calls `onOpenStatus` with `"playing"`.
  - Same data: `getByLabelText("Average rating 7.0 out of 10")` exists and is not a button (`queryByRole("button", { name: /Average rating/ })` is null).
  - No rated games: no element labelled `/Average rating/`.
  - Empty backlog (default `fakeEndpoints`): button `"Find games to add"` and text `"Your stats show up here once your backlog has games."`; no `"Waiting…"` button; pressing it calls `onFindGames`.
  - `listBacklog: () => new Promise(() => {})`: no `/^Stats/` header and no `"Find games to add"`.
  - `listBacklog` rejects with nothing cached: section absent.
  - Review Focus 1: seed the query client with a backlog, then make `listBacklog` reject on refetch → rows still shown.
  - Review Focus 5: first `listBacklog` returns one item, then an empty list; after invalidating `queryKeys` backlog → `"Find games to add"` replaces the rows.
  - Section order: the `"Stats · …"` header comes after `"Get Barklog Premium"` and before `"Barklog"` in `screen.toJSON()` text order (or via `getAllByRole("header")` order).

- [ ] **Step 2: Run** `pnpm test -- profile-screen` → new tests FAIL.

- [ ] **Step 3: Implement `StatsSection`.** Render `null` when `useBacklog().data` is `undefined`. Empty items → `<Section title={t("profile.stats.title")} footer={<Text>{emptyFooter}</Text>}>` with a `NavigationRow` (`findGames`, `gamecontroller.fill` on `systemBlue`). Otherwise `<Section title={statsTitle(total)}>` with one `Button` per `statusRows` row (`[...ROW, accessibilityLabel(row.accessibilityLabel)]`, `HStack` of `SettingsIcon`, `PRIMARY` title, `Spacer`, `SECONDARY` value, `Chevron`), then, when `averageRatingRow` is non-null, a plain `HStack` with `[ROW_SHAPE, accessibilityElement("ignore"), accessibilityLabel(...)]`. Add the props to `ProfileScreen` and place `<StatsSection …/>` right after the account `Section`.

- [ ] **Step 4: Run** `pnpm test -- profile` → PASS; `pnpm lint` and `pnpm check-types` → clean.

- [ ] **Step 5: Commit** — `feat(mobile): Stats section in the Profile tab (#82)`

### Task 4: Navigation from Stats, and docs

**Files:**

- Modify: `apps/mobile/src/app/(tabs)/profile/index.tsx`
- Test: `apps/mobile/test/routes/tabs.test.tsx` (`describe("Profile tab")`)
- Modify: `docs/superpowers/specs/2026-11-17-profile-stats-design.md` (status line), `docs/README.md` (index entry status), `docs/superpowers/specs/2026-11-17-profile-tab-design.md` (mark Stats #82 as shipped in "Screen")

**Interfaces:**

- Consumes: `ProfileScreen`'s `onOpenStatus`, `onFindGames` (Task 3).

- [ ] **Step 1: Write the failing route tests:**
  - `fakeServer({ "/api/backlog": backlogList(backlogItem(3, "playing")) })`, `renderApp("/profile")`, press `"Playing, 1 game"` → `toHaveSegments(["(tabs)", "(home)"])` and `toHaveSearchParams({ status: "playing" })`.
  - Review Focus 2: `renderApp("/?status=completed")` with the same server, go to `/profile` (press the Profile tab or `router.navigate`), press `"Playing, 1 game"` → search params `{ status: "playing" }`.
  - Empty backlog (`fakeServer()`), press `"Find games to add"` → `toHaveSegments(["(tabs)", "explore"])`.

- [ ] **Step 2: Run** `pnpm test -- tabs` → FAIL.

- [ ] **Step 3: Wire the route:** `onOpenStatus={(status) => router.navigate(\`/(tabs)/(home)?status=${status}\`)}`(the same route`widgetRoute`builds) and`onFindGames={() => router.navigate("/(tabs)/explore")}`.

- [ ] **Step 4: Run** `pnpm test` (whole mobile suite) → PASS; `pnpm lint`, `pnpm check-types` → clean.

- [ ] **Step 5: Update docs** — spec status to "implemented, pending device check"; same in `docs/README.md`; in the Profile tab design's screen sketch, point the `STATS (#82)` line at the stats spec. Run `npx prettier --check` on the changed docs and `git diff --check`.

- [ ] **Step 6: Commit** — `feat(mobile): open Home or Explore from Profile stats (#82)`

## Device check (manual, after Task 4)

On a simulator: light/dark mode, largest Dynamic Type (rows wrap, no truncation of "Durchschnittsbewertung"), VoiceOver reads each row once with no symbol names, and tapping a status row switches to the Home tab with the filter chip selected.
