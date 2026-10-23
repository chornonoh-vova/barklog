# Polish and iPhone Duo (Stage 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Title-case section headers, recent searches on the Search empty state, and the iPhone Duo verification pass.

**Architecture:** Recent-search rules (`pushRecent`, `parseRecents`) are pure and tested; the list lives in a storage-only TanStack query (`keys.recents()`, no backend), so the query cache is the one in-memory owner, shared by the Search route and `AuthGate`. AsyncStorage (in the style of `storage/flag.ts`) is written through a serialized queue, and reads wait behind it, so a read after a clear can never restore the cleared list — that is what makes an account switch safe while the Search route stays mounted. The route owns only the search bar ref and the query, and hands callbacks to `SearchScreen`. A query is recorded when a result is opened, in `SearchScreen`'s `openGame` handler, using the query the visible results belong to (not the newer one still loading behind `keepPreviousData`).

**Tech Stack:** Expo SDK 57, expo-router 57 (`Stack.SearchBar` ref → `SearchBarCommands`), AsyncStorage, vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-ipad-duo-adaptive-layout-design.md` §4 (Stage 3). Builds on Stage 2 (branch `feat/mobile-1.2`).

## Global Constraints

- Same branch as Stages 1 and 2 (`feat/mobile-1.2`); all three stages merge together as mobile 1.2.0.
- `Stack.SearchBar placement="stacked"` stays (user preference).
- Up to 8 recents, newest first, case-insensitive de-duplication, trimmed, empty queries never stored.
- Recents are device-local and cleared when `shouldClearCache` fires in `AuthGate`.
- Haptics are unchanged from Stage 1 (§4.2): Stage 3 only verifies the Home row menu path fires.
- Tests stay free of `react-native`/`expo-*` imports; lint `--max-warnings 0`; Prettier; conventional commits.

## Review Focus

1. **Corrupt or foreign storage** (non-JSON, a JSON object, an array with numbers) yields no recents rather than a crash. Pinned by `parseRecents` tests (Task 2).
2. **Re-searching an old query moves it to the top** instead of duplicating it, regardless of case. Pinned by `pushRecent` tests.
3. **Tapping a recent fills the visible search field**, not just the results. Checked manually (Task 2 Step 6).
4. **Signing out and in as someone else shows none of the previous user's recents** — including a direct account switch, where `AuthGate` keeps the Search route mounted. `clearRecents(queryClient)` sets the query to `[]` (re-rendering Search) before `queryClient.clear()`, and queues the disk removal ahead of any re-read. Checked manually.
5. **Tapping a previous query's result while the next one loads** records the previous query, not the one being typed. `SearchScreen` tracks the query its shown (non-placeholder) results came from.
6. **Section header count stays aligned with the larger title.** Checked manually (Task 1).

---

### Task 1: Title-case section headers

**Files:** modify `apps/mobile/src/theme.ts` (`SectionHeader.title`), `apps/mobile/src/features/backlog/backlog-screen.tsx`, `apps/mobile/src/features/share/share-screen.tsx`.

- [ ] **Step 1:** In `theme.ts`, `SectionHeader.title` becomes `{ ...Type.headline, color: PlatformColor("label") }` with the doc comment noting iOS 26 plain-list headers are title case. Drop `letterSpacing`.
- [ ] **Step 2:** Remove `.toUpperCase()` in both screens' section header renderers. In `backlog-screen.tsx` add `alignItems: "baseline"` to `sectionHeader` and `groupedSectionHeader` so the footnote count sits on the headline's baseline.
- [ ] **Step 3:** `pnpm --filter mobile test && pnpm --filter mobile lint && pnpm --filter mobile check-types` clean. Simulator: Home sections read "Playing 3" in headline weight; Share results headers likewise.
- [ ] **Step 4:** commit `feat(mobile): use title-case section headers`.

---

### Task 2: Recent searches

**Files:** create `src/features/search/recents.ts`, `test/recents.test.ts`, `src/features/search/recents-storage.ts`, `src/features/search/recent-searches.tsx`; modify `src/app/(tabs)/search/index.tsx`, `src/features/search/search-screen.tsx`, `src/auth/auth-gate.tsx`.

**Interfaces:** Produces `RECENT_LIMIT = 8`, `pushRecent(list: readonly string[], query: string): string[]`, `parseRecents(raw: string | null): string[]`, `keys.recents()`, `useRecents(): readonly string[]`, `recordRecent(queryClient: QueryClient, query: string): void`, `clearRecents(queryClient: QueryClient): void`, `RecentSearches({ recents, onPick, onClear })`. `SearchScreen` gains props `recents: readonly string[]`, `onPickRecent: (query: string) => void`, `onClearRecents: () => void`, `onOpenResult: (query: string) => void`.

- [ ] **Step 1: Failing tests** — `test/recents.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseRecents, pushRecent, RECENT_LIMIT } from "@/features/search/recents";

describe("pushRecent", () => {
  it("puts the newest query first", () => {
    expect(pushRecent(["zelda"], "hades")).toEqual(["hades", "zelda"]);
  });

  it("moves a repeated query to the top instead of duplicating it, ignoring case", () => {
    expect(pushRecent(["hades", "Zelda", "celeste"], "zelda")).toEqual([
      "zelda",
      "hades",
      "celeste",
    ]);
  });

  it("trims the query", () => {
    expect(pushRecent([], "  hades  ")).toEqual(["hades"]);
  });

  it("ignores an empty query", () => {
    expect(pushRecent(["hades"], "   ")).toEqual(["hades"]);
  });

  it("keeps at most RECENT_LIMIT", () => {
    const full = Array.from({ length: RECENT_LIMIT }, (_, i) => `game ${i}`);
    const next = pushRecent(full, "new");

    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe("new");
    expect(next).not.toContain(`game ${RECENT_LIMIT - 1}`);
  });

  it("does not mutate its input", () => {
    const list = ["hades"];
    pushRecent(list, "zelda");
    expect(list).toEqual(["hades"]);
  });
});

describe("parseRecents", () => {
  it("reads a stored list", () => {
    expect(parseRecents('["hades","zelda"]')).toEqual(["hades", "zelda"]);
  });

  it.each([null, "", "not json", "{}", "42", '"hades"'])(
    "returns nothing for missing or foreign data (%s)",
    (raw) => {
      expect(parseRecents(raw)).toEqual([]);
    },
  );

  it("drops entries that are not non-empty strings", () => {
    expect(parseRecents('["hades", 3, null, "", "zelda"]')).toEqual(["hades", "zelda"]);
  });

  it("trims entries and drops whitespace-only ones", () => {
    expect(parseRecents('["  hades ", "   ", "zelda"]')).toEqual(["hades", "zelda"]);
  });

  it("caps an oversized list", () => {
    const raw = JSON.stringify(Array.from({ length: 20 }, (_, i) => `g${i}`));
    expect(parseRecents(raw)).toHaveLength(RECENT_LIMIT);
  });
});
```

- [ ] **Step 2:** `pnpm --filter mobile exec vitest run test/recents.test.ts` → FAIL (module missing).

- [ ] **Step 3: Pure module** `src/features/search/recents.ts`:

```ts
export const RECENT_LIMIT = 8;

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** Newest first; a repeat moves to the top rather than appearing twice. */
export function pushRecent(list: readonly string[], query: string): string[] {
  const trimmed = query.trim();
  if (trimmed === "") return [...list];

  return [trimmed, ...list.filter((item) => !same(item, trimmed))].slice(0, RECENT_LIMIT);
}

/** Whatever is in storage, read defensively: anything unexpected is no recents. */
export function parseRecents(raw: string | null): string[] {
  if (raw === null || raw === "") return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item !== "")
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}
```

Tests → PASS.

- [ ] **Step 4: Storage** `src/features/search/recents-storage.ts`, plus `recents: () => ["recents"] as const` in `src/api/keys.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, type QueryClient } from "@tanstack/react-query";

import { keys } from "@/api/keys";
import { parseRecents, pushRecent } from "@/features/search/recents";

const KEY = "search.recents";
const EMPTY: readonly string[] = [];

/** Disk writes in call order, and reads behind them, so a read that follows a
 * clear can never bring the cleared list back. */
let writes: Promise<void> = Promise.resolve();

function persist(op: () => Promise<void>): void {
  writes = writes.then(op).catch(() => {
    // Ignored: see below.
  });
}

/**
 * A query with no backend: the cache is the one in-memory owner, shared by the
 * Search route and `AuthGate`. AsyncStorage like `storage/flag.ts`: an
 * uninstall clears it. Failures are swallowed — losing a recent search is not
 * worth an error.
 */
const recentsQuery = {
  queryKey: keys.recents(),
  queryFn: () => writes.then(() => AsyncStorage.getItem(KEY)).then(parseRecents, () => []),
  staleTime: Infinity,
};

export function useRecents(): readonly string[] {
  return useQuery(recentsQuery).data ?? EMPTY;
}

/** Waits for the stored list, so a search made before it loads adds to it
 * rather than overwriting it. */
export function recordRecent(queryClient: QueryClient, query: string): void {
  void queryClient.ensureQueryData(recentsQuery).then((stored) => {
    const next = pushRecent(queryClient.getQueryData(recentsQuery.queryKey) ?? stored, query);
    queryClient.setQueryData(recentsQuery.queryKey, next);
    persist(() => AsyncStorage.setItem(KEY, JSON.stringify(next)));
  });
}

/** Through `setQueryData`, not only the disk: an account switch keeps the
 * Search route mounted, and `queryClient.clear()` drops the query without
 * telling its observer. Call before `clear()`. */
export function clearRecents(queryClient: QueryClient): void {
  queryClient.setQueryData(recentsQuery.queryKey, []);
  persist(() => AsyncStorage.removeItem(KEY));
}
```

In `auth-gate.tsx`, recents first so the mounted Search route hears it before the cache is dropped:

```ts
if (shouldClearRecents(previous.current, userId)) clearRecents(queryClient);
if (shouldClearCache(previous.current, userId)) queryClient.clear();
```

Do not keep a separate `useState` copy of the list in the route: a second in-memory owner is exactly what lets the previous account's searches survive a direct account switch.

- [ ] **Step 5: UI.** `src/features/search/recent-searches.tsx` — a `ScrollView` (`contentInsetAdjustmentBehavior="automatic"`, `keyboardDismissMode="on-drag"`, `contentContainerStyle={useSideInsets()}`) with a header row ("Recent" in `Type.headline`, and a `Pressable` "Clear" in `PlatformColor("link")`, `minHeight: 44`), then one `Pressable` row per query (`minHeight: 44`, `clock.arrow.circlepath` `SymbolView`, the query in `Type.body`, hairline separator, `accessibilityRole="button"`, `accessibilityLabel={\`Search for ${query}\`}`).

`search/index.tsx`:

```tsx
const queryClient = useQueryClient();
const recents = useRecents();

const record = useCallback(
  (searched: string) => recordRecent(queryClient, searched),
  [queryClient],
);
const clear = useCallback(() => clearRecents(queryClient), [queryClient]);

const pickRecent = useCallback((recent: string) => {
  searchBar.current?.setText(recent);
  setQuery(recent);
}, []);
```

passed as `recents`, `onPickRecent={pickRecent}`, `onClearRecents={clear}`, `onOpenResult={record}`.

`search-screen.tsx`: in the `query.length < SEARCH_QUERY_MIN` branch, render `<RecentSearches recents={recents} onPick={onPickRecent} onClear={onClearRecents} />` when `recents.length > 0`, else today's `EmptyState`. `useSearchGames` keeps the previous results on screen while the next query loads, so track the query the shown results belong to — `const [shownQuery, setShownQuery] = useState(debounced)`, updated during render when `search.data` is present and `!search.isPlaceholderData`. `openGame` calls `onOpenResult(shownQuery)` before `router.push(`/search/game/${id}`)`, with `onOpenResult` and `shownQuery` in its dependency list; the "No games found" copy names `shownQuery` too.

- [ ] **Step 6:** tests + lint + types clean. Simulator: search "hades", open a result, go back, clear the field → "Recent: hades". Tap it → the field shows "hades" and results appear. Search "HADES", open a result → still one entry, at the top. Clear → empty state returns. Sign out and in → no recents. With two accounts, switch directly from one to the other while Search is open → the list empties and stays empty. Type a new query and tap a previous result before the new one loads → the previous query is recorded.
- [ ] **Step 7:** commit `feat(mobile): remember recent searches`.

---

### Task 3: iPhone Duo verification

**Files:** modify `docs/mobile-device-verification.md`.

**Precondition:** Xcode 27.1 with the iPhone Duo simulator in Device Hub. If it is not installed (`xcodebuild -version` reports 27.0), write the checklist only, ledger the pass as deferred, and finish.

- [ ] **Step 1:** Append `## iPhone Duo (Stage 3)` with the spec §4.4 matrix — outer display portrait and landscape (tent), inner display open, inner display ½ Split View, live open/close/fold on Home, Search, game detail and the screenshot viewer — and checks: columns and detail split follow the fold without losing scroll position or the stack; tab bar placement on the inner display (and whether `sidebarAdaptable` does anything); no content under the status bar or camera region with asymmetric insets; sheets centred on the inner display; onboarding and screenshot viewer in every pose; the status haptic from the Home row menu (physical device).
- [ ] **Step 2:** If Xcode 27.1 is available, build with it, run the matrix, record ✅ or the defect per cell; each defect in Stage 1–3 scope gets a `fix(mobile): …` commit.
- [ ] **Step 3:** `pnpm --filter mobile test && pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm format:check` → pass.
- [ ] **Step 4:** commit `docs: add iPhone Duo verification checklist`.
