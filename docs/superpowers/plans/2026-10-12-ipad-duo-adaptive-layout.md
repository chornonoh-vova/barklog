# iPad & iPhone Duo Adaptive Layout (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Barklog a good citizen on iPad and iPhone Duo — width-based card columns on Home and Search, a two-column game detail, sheets on wide windows, the sidebar-adaptable tab bar — and play a haptic when a game's status changes.

**Architecture:** Every layout decision is a pure function in `src/ui/columns.ts` (tested in plain Node with vitest), fed by a view's own measured width from a small `useMeasuredWidth` hook. Screens group items into rows with `chunk` and render each row through one shared `GameGridRow`; one column renders today's plain rows unchanged. The haptic lives in the backlog upsert mutation so every status-changing path gets it.

**Tech Stack:** Expo SDK 57, React Native 0.86, expo-router 57 (`NativeTabs`, native `Stack`), react-native-screens 4.26, TanStack Query 5, `expo-haptics` (new), vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-ipad-duo-adaptive-layout-design.md` (Stage 1 = §2, including §2.6a). Stages 2 and 3 get their own plans.

## Global Constraints

- Lay out from available width only — never device idiom, orientation, or `Dimensions.get("screen")` / `UIScreen.main`.
- A portrait iPhone must render exactly what it renders today (one column → plain rows, single-column detail, full-screen modals).
- `CARD_MIN_WIDTH = 320`, `GUTTER = 16`, `COLUMN_GAP = 12`, `MAX_COLUMNS = 3`, `MAX_TEXT_SCALE = 1.6`, `DETAIL_SPLIT_MIN_WIDTH = 700`, `SHEET_MIN_WIDTH = 700`.
- Anything under `apps/mobile/test/` must not import `react-native`, `@expo/ui` or `expo-*` (vitest runs in plain Node — see `apps/mobile/vitest.config.mts`).
- Read the versioned Expo docs (`https://docs.expo.dev/versions/v57.0.0/`) before using an Expo API you have not used in this repo (`apps/mobile/AGENTS.md`).
- Colours come from `PlatformColor` only; the only hex literal stays `Brand.tint` in `theme.ts`.
- Lint runs with `--max-warnings 0`; Prettier formats the repo.
- Commit messages follow the repo's conventional style (`feat:`, `fix:`, `chore:`).
- Haptic: one `NotificationFeedbackType.Success` on status change at optimistic apply; never on rating-only change, removal, or navigation.

## Review Focus

1. **Live width change while scrolled** (iPad Split View divider drag; stand-in for Duo folding) — columns re-flow without a crash, without losing the navigation stack, and the list does not remount (no `numColumns`, no `key` on the list). Pinned by Task 1's `chunk` tests and checked manually in Task 9.
2. **A short last row** (e.g. a filter that leaves 1 game in a 3-column grid) — the lone card keeps the width it would have in a full row instead of stretching across the screen. Pinned by `GameGridRow`'s empty slots (Task 4) and `chunk` short-row test (Task 1); checked in Task 9.
3. **Large Dynamic Type on a wide screen** — fewer, wider cards rather than truncated titles, but not forced to one column on a 13" iPad. Pinned by the `fontScale` rows of the `columnCount` table (Task 1).
4. **Rating-only change** — must not buzz; adding a game must. Pinned by `status-haptic.test.ts` (Task 3).
5. **Paywall / profile from a narrow iPad Split View** (⅓ width) — full screen, not a cramped sheet; and swiping a page-sheet profile down must leave the avatar tappable again (`onRequestClose` resets state). Pinned by `prefersSheet` tests (Task 1) and Task 8's manual step.

---

## File Structure

| File                                                   | Status | Responsibility                                                                            |
| ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------- |
| `apps/mobile/app.json`                                 | modify | Opt in to iPad and all orientations                                                       |
| `apps/mobile/src/app/(tabs)/_layout.tsx`               | modify | `sidebarAdaptable` tab bar                                                                |
| `apps/mobile/src/ui/columns.ts`                        | create | Pure layout decisions: `columnCount`, `chunk`, `detailIsSplit`, `prefersSheet`, constants |
| `apps/mobile/test/columns.test.ts`                     | create | Tests for the above                                                                       |
| `apps/mobile/src/ui/use-measured-width.ts`             | create | Hook: window width first, then the view's own `onLayout` width                            |
| `apps/mobile/src/features/backlog/sections.ts`         | modify | `toRowSections` — section items chunked into rows                                         |
| `apps/mobile/test/sections.test.ts`                    | modify | Tests for `toRowSections`                                                                 |
| `apps/mobile/src/features/backlog/status-haptic.ts`    | create | Pure `shouldPlayStatusHaptic`                                                             |
| `apps/mobile/test/status-haptic.test.ts`               | create | Tests for it                                                                              |
| `apps/mobile/src/api/hooks.ts`                         | modify | `onApply` hook in the backlog mutation; haptic in upsert                                  |
| `apps/mobile/src/theme.ts`                             | modify | Grouped background variants for list and sticky header                                    |
| `apps/mobile/src/components/game-row.tsx`              | modify | `variant: "row" \| "card"`                                                                |
| `apps/mobile/src/components/game-grid-row.tsx`         | create | One row of cards with gaps and empty slots                                                |
| `apps/mobile/src/features/backlog/backlog-screen.tsx`  | modify | Home grid                                                                                 |
| `apps/mobile/src/features/search/search-screen.tsx`    | modify | Search grid                                                                               |
| `apps/mobile/src/features/game/game-detail-screen.tsx` | modify | Two-column detail                                                                         |
| `apps/mobile/src/app/_layout.tsx`                      | modify | Paywall/shared as page sheets when wide                                                   |
| `apps/mobile/src/app/paywall.tsx`                      | modify | Comment only (no longer always full screen)                                               |
| `apps/mobile/src/components/profile-toolbar.tsx`       | modify | Profile as page sheet when wide                                                           |
| `docs/mobile-device-verification.md`                   | modify | iPad / adaptive layout checklist and results                                              |

---

### Task 1: Pure layout decisions — `src/ui/columns.ts`

**Files:**

- Create: `apps/mobile/src/ui/columns.ts`
- Test: `apps/mobile/test/columns.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces (used by Tasks 2, 4, 5, 6, 7, 8):
  - `CARD_MIN_WIDTH`, `GUTTER`, `COLUMN_GAP`, `MAX_COLUMNS`, `MAX_TEXT_SCALE`, `DETAIL_SPLIT_MIN_WIDTH`, `SHEET_MIN_WIDTH`: `number`
  - `columnCount(width: number, fontScale: number): number`
  - `chunk<T>(items: readonly T[], columns: number): T[][]`
  - `detailIsSplit(width: number, fontScale: number): boolean`
  - `prefersSheet(windowWidth: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/test/columns.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  chunk,
  columnCount,
  DETAIL_SPLIT_MIN_WIDTH,
  detailIsSplit,
  MAX_COLUMNS,
  prefersSheet,
  SHEET_MIN_WIDTH,
} from "@/ui/columns";

describe("columnCount", () => {
  it.each([
    { width: 402, fontScale: 1, expected: 1, context: "iPhone portrait" },
    { width: 440, fontScale: 1, expected: 1, context: "iPhone Pro Max portrait" },
    { width: 744, fontScale: 1, expected: 2, context: "iPad mini portrait" },
    { width: 956, fontScale: 1, expected: 2, context: "iPhone Pro Max landscape" },
    { width: 1050, fontScale: 1, expected: 3, context: "13-inch iPad landscape, sidebar open" },
    { width: 1376, fontScale: 1, expected: 3, context: "13-inch iPad landscape, capped" },
    { width: 744, fontScale: 1.35, expected: 1, context: "iPad mini, larger text" },
    { width: 1376, fontScale: 3, expected: 2, context: "13-inch iPad, AX5 (scale capped)" },
    { width: 402, fontScale: 0.8, expected: 1, context: "iPhone, smallest text" },
  ])("$context ($width pt, x$fontScale) → $expected", ({ width, fontScale, expected }) => {
    expect(columnCount(width, fontScale)).toBe(expected);
  });

  it("never exceeds MAX_COLUMNS however wide", () => {
    expect(columnCount(10_000, 1)).toBe(MAX_COLUMNS);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to one column for an unusable width (%s)",
    (width) => {
      expect(columnCount(width, 1)).toBe(1);
    },
  );

  it("treats an unusable fontScale as 1", () => {
    expect(columnCount(744, Number.NaN)).toBe(columnCount(744, 1));
    expect(columnCount(744, 0)).toBe(columnCount(744, 1));
  });
});

describe("chunk", () => {
  it("returns no rows for no items", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("fills rows exactly when the count divides evenly", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("leaves a short last row", () => {
    expect(chunk([1, 2, 3, 4, 5], 3)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
  });

  it("puts each item on its own row for one column", () => {
    expect(chunk(["a", "b"], 1)).toEqual([["a"], ["b"]]);
  });

  it("treats a non-positive column count as one", () => {
    expect(chunk(["a", "b"], 0)).toEqual([["a"], ["b"]]);
  });

  it("does not mutate its input", () => {
    const items = [1, 2, 3];
    chunk(items, 2);
    expect(items).toEqual([1, 2, 3]);
  });
});

describe("detailIsSplit", () => {
  it("splits at the threshold and above", () => {
    expect(detailIsSplit(DETAIL_SPLIT_MIN_WIDTH, 1)).toBe(true);
    expect(detailIsSplit(1024, 1)).toBe(true);
  });

  it("stays single-column below it", () => {
    expect(detailIsSplit(DETAIL_SPLIT_MIN_WIDTH - 1, 1)).toBe(false);
    expect(detailIsSplit(440, 1)).toBe(false);
  });

  it("needs more width at larger text sizes", () => {
    expect(detailIsSplit(800, 1)).toBe(true);
    expect(detailIsSplit(800, 1.35)).toBe(false);
  });

  it("caps the text scale so the largest sizes can still split on a big iPad", () => {
    expect(detailIsSplit(1376, 3)).toBe(true);
  });

  it("does not split an unusable width", () => {
    expect(detailIsSplit(Number.NaN, 1)).toBe(false);
  });
});

describe("prefersSheet", () => {
  it("presents as a sheet at the threshold and above", () => {
    expect(prefersSheet(SHEET_MIN_WIDTH)).toBe(true);
    expect(prefersSheet(1376)).toBe(true);
  });

  it("stays full screen on a phone or a narrow Split View", () => {
    expect(prefersSheet(440)).toBe(false);
    expect(prefersSheet(SHEET_MIN_WIDTH - 1)).toBe(false);
  });

  it("stays full screen for an unusable width", () => {
    expect(prefersSheet(Number.NaN)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter mobile exec vitest run test/columns.test.ts`
Expected: FAIL — `Failed to resolve import "@/ui/columns"`.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/ui/columns.ts`:

```ts
/**
 * Layout decisions for wide windows: iPad, iPad Split View, iPhone landscape
 * and iPhone Duo's inner display. Every input is a width the caller measured —
 * never a device idiom or orientation, which Apple's iPhone Duo guidance rules
 * out — so the same numbers hold when a window is resized live.
 */

/** Narrowest a card may get before it drops a column. */
export const CARD_MIN_WIDTH = 320;

/** Outer margin, matching the 16pt list inset used everywhere else. */
export const GUTTER = 16;

export const COLUMN_GAP = 12;

/** More than three cards of row content stop reading as a list. */
export const MAX_COLUMNS = 3;

/** Text grows cards up to this scale; past it, AX sizes would force one column
 * even on a 13-inch iPad. */
export const MAX_TEXT_SCALE = 1.6;

export const DETAIL_SPLIT_MIN_WIDTH = 700;

export const SHEET_MIN_WIDTH = 700;

const usable = (value: number) => Number.isFinite(value) && value > 0;

const textScale = (fontScale: number) =>
  usable(fontScale) ? Math.min(fontScale, MAX_TEXT_SCALE) : 1;

/** How many cards fit side by side in `width` points. */
export function columnCount(width: number, fontScale: number): number {
  if (!usable(width)) return 1;

  const card = CARD_MIN_WIDTH * textScale(fontScale);
  const fit = Math.floor((width - 2 * GUTTER + COLUMN_GAP) / (card + COLUMN_GAP));

  return Math.min(Math.max(fit, 1), MAX_COLUMNS);
}

/** Splits `items` into rows of `columns`; the last row may be short. */
export function chunk<T>(items: readonly T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    rows.push(items.slice(start, start + size));
  }

  return rows;
}

/** Whether the game detail has room for its two-column layout. */
export function detailIsSplit(width: number, fontScale: number): boolean {
  return usable(width) && width >= DETAIL_SPLIT_MIN_WIDTH * textScale(fontScale);
}

/** Whether a modal should be a page sheet rather than cover the window. */
export function prefersSheet(windowWidth: number): boolean {
  return usable(windowWidth) && windowWidth >= SHEET_MIN_WIDTH;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter mobile exec vitest run test/columns.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm --filter mobile lint && pnpm --filter mobile check-types
git add apps/mobile/src/ui/columns.ts apps/mobile/test/columns.test.ts
git commit -m "feat(mobile): add width-based layout decisions"
```

---

### Task 2: Backlog sections as rows — `toRowSections`

**Files:**

- Modify: `apps/mobile/src/features/backlog/sections.ts`
- Test: `apps/mobile/test/sections.test.ts`

**Interfaces:**

- Consumes: `chunk` from Task 1.
- Produces (used by Task 5):
  - `interface BacklogRowSection { status: BacklogStatus; title: string | null; count: number; data: BacklogListItemWire[][] }`
  - `toRowSections(sections: BacklogSection[], columns: number): BacklogRowSection[]`

- [ ] **Step 1: Write the failing test**

Append to `apps/mobile/test/sections.test.ts`, and change its import line to:

```ts
import { STATUS_ORDER, toRowSections, toSections } from "@/features/backlog/sections";
```

```ts
describe("toRowSections", () => {
  it("chunks each section's items into rows of the column count", () => {
    const sections = toSections(
      [entry("playing"), entry("playing"), entry("playing"), entry("waiting")],
      undefined,
    );

    const rows = toRowSections(sections, 2);

    expect(rows.map((s) => s.data.map((row) => row.length))).toEqual([[2, 1], [1]]);
  });

  it("keeps the section's item count, not its row count", () => {
    const rows = toRowSections(toSections([entry("playing"), entry("playing")], undefined), 2);

    expect(rows[0]?.count).toBe(2);
    expect(rows[0]?.data).toHaveLength(1);
  });

  it("keeps status and title", () => {
    const rows = toRowSections(toSections([entry("completed")], undefined), 3);

    expect(rows[0]?.status).toBe("completed");
    expect(rows[0]?.title).toBe("Completed");
  });

  it("gives one item per row for one column, so the phone layout is unchanged", () => {
    const first = entry("playing", "First");
    const second = entry("playing", "Second");
    const rows = toRowSections(toSections([first, second], undefined), 1);

    expect(rows[0]?.data.map((row) => row.map((i) => i.game.name))).toEqual([
      ["First"],
      ["Second"],
    ]);
  });

  it("returns no sections for no sections", () => {
    expect(toRowSections([], 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter mobile exec vitest run test/sections.test.ts`
Expected: FAIL — `toRowSections is not a function` (or a TypeScript import error).

- [ ] **Step 3: Write the implementation**

In `apps/mobile/src/features/backlog/sections.ts`, add the import after the existing `statusLabel` import:

```ts
import { chunk } from "@/ui/columns";
```

and append:

```ts
/** A section whose items are grouped into rows of cards for a wide window. */
export interface BacklogRowSection extends Omit<BacklogSection, "data"> {
  data: BacklogListItemWire[][];
}

/** `count` stays the number of games — it is what the header shows. */
export function toRowSections(sections: BacklogSection[], columns: number): BacklogRowSection[] {
  return sections.map((section) => ({ ...section, data: chunk(section.data, columns) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter mobile exec vitest run test/sections.test.ts`
Expected: PASS (old and new cases).

- [ ] **Step 5: Commit**

```bash
pnpm --filter mobile lint && pnpm --filter mobile check-types
git add apps/mobile/src/features/backlog/sections.ts apps/mobile/test/sections.test.ts
git commit -m "feat(mobile): group backlog sections into rows"
```

---

### Task 3: Haptic on status change

**Files:**

- Create: `apps/mobile/src/features/backlog/status-haptic.ts`
- Test: `apps/mobile/test/status-haptic.test.ts`
- Modify: `apps/mobile/src/api/hooks.ts` (`useBacklogEntryMutation` at ~line 114, `useUpsertBacklogEntry` at ~line 162)
- Modify: `apps/mobile/package.json`, `pnpm-lock.yaml` (via `expo install`)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `shouldPlayStatusHaptic(previous: BacklogStatus | null | undefined, next: BacklogStatus): boolean`; `useBacklogEntryMutation` option `onApply?: (previous: BacklogEntryWire | null | undefined, input: TInput) => void`. Stage 2's context menu relies on the haptic living in `useUpsertBacklogEntry`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/test/status-haptic.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { shouldPlayStatusHaptic } from "@/features/backlog/status-haptic";

describe("shouldPlayStatusHaptic", () => {
  it("plays when a game is added to the backlog", () => {
    expect(shouldPlayStatusHaptic(null, "waiting")).toBe(true);
  });

  it("plays when a game moves to another status", () => {
    expect(shouldPlayStatusHaptic("playing", "completed")).toBe(true);
  });

  it("stays quiet for a rating-only change (status unchanged)", () => {
    expect(shouldPlayStatusHaptic("playing", "playing")).toBe(false);
  });

  it("plays when the previous status is unknown — the user deliberately picked one", () => {
    expect(shouldPlayStatusHaptic(undefined, "abandoned")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter mobile exec vitest run test/status-haptic.test.ts`
Expected: FAIL — cannot resolve `@/features/backlog/status-haptic`.

- [ ] **Step 3: Write the pure function**

Create `apps/mobile/src/features/backlog/status-haptic.ts`:

```ts
import type { BacklogStatus } from "@repo/contracts";

/**
 * A status change is the one backlog edit worth a haptic: it is the decision
 * the app exists to record. A rating-only edit arrives with the status
 * unchanged and stays quiet. `undefined` — the detail was not cached, so the
 * old status is unknown — still plays, because a status was picked on purpose.
 */
export function shouldPlayStatusHaptic(
  previous: BacklogStatus | null | undefined,
  next: BacklogStatus,
): boolean {
  return previous !== next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter mobile exec vitest run test/status-haptic.test.ts`
Expected: PASS.

- [ ] **Step 5: Install expo-haptics**

Read `https://docs.expo.dev/versions/v57.0.0/sdk/haptics/` first.

```bash
cd apps/mobile && npx expo install expo-haptics
```

Expected: `apps/mobile/package.json` gains `"expo-haptics": "~57.0.3"` (or the SDK-57 version `expo install` picks) and `pnpm-lock.yaml` updates.

- [ ] **Step 6: Wire it into the mutation**

In `apps/mobile/src/api/hooks.ts`:

Add imports (next to the other third-party and `@/` imports respectively):

```ts
import { notificationAsync, NotificationFeedbackType } from "expo-haptics";
```

```ts
import { shouldPlayStatusHaptic } from "@/features/backlog/status-haptic";
```

Extend `useBacklogEntryMutation`'s options type:

```ts
  options: {
    mutationFn: (input: TInput) => Promise<unknown>;
    entry: (previous: GameDetailResponse, input: TInput) => BacklogEntryWire | null;
    /** Runs once the optimistic entry is in the cache, with the entry it
     * replaced: `undefined` when the detail was not cached at all. */
    onApply?: (previous: BacklogEntryWire | null | undefined, input: TInput) => void;
  },
```

In its `onMutate`, call it after the `if (previous) { … }` block and before `return { previous };`:

```ts
options.onApply?.(previous?.backlogEntry, input);
```

In `useUpsertBacklogEntry`, add after `entry: …`:

```ts
    // At apply time, not on success: the screen already shows the new status,
    // and a haptic that waits on the network lands after the change it marks.
    // A failure is corrected by the rollback and alert in `onError`.
    onApply: (previous, input) => {
      const previousStatus = previous === undefined ? undefined : (previous?.status ?? null);

      if (shouldPlayStatusHaptic(previousStatus, input.status)) {
        void notificationAsync(NotificationFeedbackType.Success);
      }
    },
```

- [ ] **Step 7: Verify and commit**

```bash
pnpm --filter mobile test && pnpm --filter mobile lint && pnpm --filter mobile check-types
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/features/backlog/status-haptic.ts apps/mobile/test/status-haptic.test.ts apps/mobile/src/api/hooks.ts
git commit -m "feat(mobile): play a haptic when a game's status changes"
```

On-device check happens in Task 9 (simulators do not play haptics — use a physical iPhone).

---

### Task 4: Opt in to iPad, sidebar tab bar, and UI building blocks

**Files:**

- Modify: `apps/mobile/app.json` (`orientation`, `ios.supportsTablet`)
- Modify: `apps/mobile/src/app/(tabs)/_layout.tsx`
- Modify: `apps/mobile/src/theme.ts` (`Screen`, `SectionHeader`)
- Modify: `apps/mobile/src/components/game-row.tsx`
- Create: `apps/mobile/src/components/game-grid-row.tsx`
- Create: `apps/mobile/src/ui/use-measured-width.ts`

**Interfaces:**

- Consumes: `COLUMN_GAP`, `GUTTER` (Task 1).
- Produces (used by Tasks 5–7):
  - `Screen.groupedFill`, `SectionHeader.groupedContainer` style objects
  - `type GameRowVariant = "row" | "card"`; `GameRow` prop `variant?: GameRowVariant` (default `"row"`)
  - `GameGridRow({ columns: number; children: ReactNode })`
  - `useMeasuredWidth(): { width: number; fontScale: number; onLayout: (event: LayoutChangeEvent) => void }`

No unit tests: everything here imports `react-native`, which vitest cannot load (Global Constraints). Verified by typecheck, lint, and running on the iPad simulator.

- [ ] **Step 1: Opt in**

`apps/mobile/app.json`: change `"orientation": "portrait"` to `"orientation": "default"` and `"supportsTablet": false` to `"supportsTablet": true`.

`apps/mobile/src/app/(tabs)/_layout.tsx`: change the opening tag to

```tsx
    <NativeTabs minimizeBehavior="onScrollDown" sidebarAdaptable>
```

- [ ] **Step 2: Grouped theme variants**

In `apps/mobile/src/theme.ts`, replace the `Screen` and `SectionHeader` exports with:

```ts
/** `listContent` must grow, or a `ListEmptyComponent` — cloned straight into
 * the content container — has no height and gets clipped. `groupedFill` is the
 * background a grid of cards sits on. */
export const Screen = {
  fill: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  groupedFill: { flex: 1, backgroundColor: PlatformColor("systemGroupedBackground") },
  listContent: { flexGrow: 1 },
} as const;

const SECTION_HEADER_INSETS = { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 } as const;

/** Shared by the two `SectionList` screens. Opaque, or sticky headers show the
 * rows sliding under them — so the grouped variant has to match the grouped
 * list behind it, or it shows as a white band over a grey grid. */
export const SectionHeader = {
  container: { ...SECTION_HEADER_INSETS, backgroundColor: PlatformColor("systemBackground") },
  groupedContainer: {
    ...SECTION_HEADER_INSETS,
    backgroundColor: PlatformColor("systemGroupedBackground"),
  },
  title: {
    ...Type.footnote,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: PlatformColor("secondaryLabel"),
  },
} as const;
```

- [ ] **Step 3: Card variant on `GameRow`**

In `apps/mobile/src/components/game-row.tsx`:

Add above the component:

```tsx
/** `row` is the plain list row a phone shows; `card` is one cell of a grid on a
 * wider window. Same content, so the two never drift apart. */
export type GameRowVariant = "row" | "card";
```

Add `variant = "row",` to the destructured props and `variant?: GameRowVariant;` to the props type. Replace the `Pressable` `style` and the chevron:

```tsx
      style={({ pressed }) => {
        const card = variant === "card";
        return [
          card ? styles.card : styles.row,
          pressed && (card ? styles.cardPressed : styles.pressed),
        ];
      }}
```

```tsx
{
  variant === "row" ? (
    <SymbolView name="chevron.right" size={13} tintColor={PlatformColor("tertiaryLabel")} />
  ) : null;
}
```

Add to `styles`:

```ts
  /** `flex: 1` so every card in a `GameGridRow` fills its slot and a row's
   * cards share the tallest one's height. */
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  cardPressed: {
    backgroundColor: PlatformColor("tertiarySystemGroupedBackground"),
  },
```

- [ ] **Step 4: `GameGridRow`**

Create `apps/mobile/src/components/game-grid-row.tsx`:

```tsx
import { Children, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { COLUMN_GAP, GUTTER } from "@/ui/columns";

/**
 * One row of a card grid. A short last row keeps empty slots, so a lone card
 * keeps the width it has in a full row instead of stretching across the
 * window. The slots are plain views: VoiceOver skips them.
 */
export function GameGridRow({ columns, children }: { columns: number; children: ReactNode }) {
  const empty = Math.max(0, columns - Children.count(children));

  return (
    <View style={styles.row}>
      {Children.map(children, (child) => (
        <View style={styles.slot}>{child}</View>
      ))}
      {Array.from({ length: empty }, (_, index) => (
        <View key={`empty-${index}`} style={styles.slot} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: COLUMN_GAP,
    paddingHorizontal: GUTTER,
    paddingBottom: COLUMN_GAP,
  },
  slot: { flex: 1 },
});
```

- [ ] **Step 5: `useMeasuredWidth`**

Create `apps/mobile/src/ui/use-measured-width.ts`:

```ts
import { useCallback, useState } from "react";
import { useWindowDimensions, type LayoutChangeEvent } from "react-native";

/**
 * A view's own width, for layout decisions in `columns.ts`. Starts from the
 * window so the first frame is already close (no rows-to-cards flash on iPad),
 * then follows `onLayout` — which, unlike the window, knows an open iPad
 * sidebar is taking ~320pt. Never the screen: on iPhone Duo and in iPad Split
 * View the screen says nothing about the space the app actually has.
 *
 * `fontScale` comes from the window so a Dynamic Type change re-renders, as in
 * `GameTile`.
 */
export function useMeasuredWidth() {
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<number>();

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setMeasured(event.nativeEvent.layout.width);
  }, []);

  return { width: measured ?? window.width, fontScale: window.fontScale, onLayout };
}
```

- [ ] **Step 6: Typecheck, lint**

Run: `pnpm --filter mobile check-types && pnpm --filter mobile lint`
Expected: no errors. (`GameRow` callers are unchanged — `variant` defaults to `"row"`.)

- [ ] **Step 7: Baseline run on iPad**

`app.json` changed, so the native project must be regenerated.

```bash
pnpm deps:up
pnpm --filter api dev          # separate terminal
pnpm --filter mobile prebuild
cd apps/mobile && APP_VARIANT=development npx expo run:ios --device "iPad Pro 13-inch (M5)"
```

Expected: the app launches full-screen on iPad (not letterboxed), rotates to landscape, and the tab bar is the floating iPadOS one with a sidebar toggle. Home still shows plain rows (Task 5 not done yet). Save a screenshot:

```bash
xcrun simctl io booted screenshot /tmp/barklog-ipad-baseline.png
```

If `sidebarAdaptable` misbehaves with the `role="search"` tab or `minimizeBehavior`, remove `sidebarAdaptable`, note it in the commit body, and continue (spec §5).

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app.json "apps/mobile/src/app/(tabs)/_layout.tsx" apps/mobile/src/theme.ts apps/mobile/src/components/game-row.tsx apps/mobile/src/components/game-grid-row.tsx apps/mobile/src/ui/use-measured-width.ts
git commit -m "feat(mobile): support iPad and add card grid building blocks"
```

---

### Task 5: Home as a card grid on wide windows

**Files:**

- Modify: `apps/mobile/src/features/backlog/backlog-screen.tsx`

**Interfaces:**

- Consumes: `columnCount` (Task 1), `toRowSections`, `BacklogRowSection` (Task 2), `GameGridRow`, `GameRowVariant`, `useMeasuredWidth`, `Screen.groupedFill`, `SectionHeader.groupedContainer` (Task 4).
- Produces: nothing new.

- [ ] **Step 1: Imports and module-level renderers**

Replace the imports and the `keyExtractor` / `renderSectionHeader` block at the top of `backlog-screen.tsx` with:

```tsx
import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  PlatformColor,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useBacklog, useBacklogStats, useIsPremium } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameGridRow } from "@/components/game-grid-row";
import { GameRow, type GameRowVariant } from "@/components/game-row";
import { LoadingState } from "@/components/query-states";
import { QueryBoundary } from "@/components/query-boundary";
import { EMPTY_BACKLOG, EMPTY_FILTER } from "@/features/backlog/empty-states";
import { toRowSections, toSections, type BacklogRowSection } from "@/features/backlog/sections";
import { slotsLabel } from "@/features/backlog/slots";
import { StatusFilter } from "@/features/backlog/status-filter";
import { rowSubtitle, statsLine } from "@/features/game/format";
import { useReviewPrompt } from "@/review/use-review-prompt";
import { Screen, SectionHeader, Type } from "@/theme";
import { columnCount } from "@/ui/columns";
import { useMeasuredWidth } from "@/ui/use-measured-width";

// A row's first game, so a key survives the column count changing under it.
const keyExtractor = (row: BacklogListItemWire[]) => String(row[0]?.gameId);

// Lowercase, deliberately not components: `SectionList` calls these as plain
// functions, and React Compiler would give a component a `useMemoCache` call
// that then runs outside a render. Two of them because the sticky header must
// match the list behind it — plain under rows, grouped under cards.
const sectionHeaderRenderer =
  (grouped: boolean) =>
  ({ section }: { section: BacklogRowSection }) =>
    section.title === null ? null : (
      <View style={grouped ? styles.groupedSectionHeader : styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
        <Text style={styles.sectionCount}>{section.count}</Text>
      </View>
    );

const renderSectionHeader = sectionHeaderRenderer(false);
const renderGroupedSectionHeader = sectionHeaderRenderer(true);
```

- [ ] **Step 2: Columns, renderItem, sections**

Inside `BacklogScreen`, after `const slots = …`, add:

```tsx
const { width, fontScale, onLayout } = useMeasuredWidth();
const columns = columnCount(width, fontScale);
const grid = columns > 1;
```

Replace the existing `renderItem` and `sections` with:

```tsx
const renderItem = useCallback(
  ({ item }: { item: BacklogListItemWire[] }) => {
    const game = (entry: BacklogListItemWire, variant: GameRowVariant) => (
      <GameRow
        key={entry.gameId}
        id={entry.gameId}
        title={entry.game.name}
        subtitle={rowSubtitle(entry)}
        coverImageId={entry.game.coverImageId}
        variant={variant}
        onPress={openGame}
      />
    );

    return grid ? (
      <GameGridRow columns={columns}>{item.map((entry) => game(entry, "card"))}</GameGridRow>
    ) : (
      <>{item.map((entry) => game(entry, "row"))}</>
    );
  },
  [openGame, grid, columns],
);

const sections = useMemo(
  () => toRowSections(toSections(backlog.data?.items ?? [], filter), columns),
  [backlog.data, filter, columns],
);
```

- [ ] **Step 3: The list**

In the `SectionList` JSX, change/add these props (leave the rest as is):

```tsx
          style={grid ? styles.groupedList : styles.list}
          onLayout={onLayout}
          renderSectionHeader={grid ? renderGroupedSectionHeader : renderSectionHeader}
```

Do **not** add a `key` to the `SectionList`: changing columns must re-flow, not remount (Review Focus 1).

- [ ] **Step 4: Styles**

In `styles`, add:

```ts
  groupedList: Screen.groupedFill,
  groupedSectionHeader: {
    ...SectionHeader.groupedContainer,
    flexDirection: "row",
    justifyContent: "space-between",
  },
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter mobile check-types && pnpm --filter mobile lint && pnpm --filter mobile test`
Expected: clean.

With Metro running (Task 4 Step 7), reload on the iPad Pro 13" simulator and check:

- Landscape full screen with the sidebar open: 3 columns of cards; with it hidden: 3 columns.
- Portrait: 2 columns.
- Filter to a status with one game: a single card at grid-cell width, not full width (Review Focus 2).
- Sticky headers are grey (grouped), not white bands, while scrolling.
- Split View ½ then ⅓ (drag the divider live): 2 → 1 columns, plain rows at 1, no crash, scroll position kept (Review Focus 1).
- iPhone 17 Pro portrait: identical to `main`.

Save screenshots to `/tmp/barklog-home-*.png` with `xcrun simctl io booted screenshot`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/backlog/backlog-screen.tsx
git commit -m "feat(mobile): show Home as a card grid on wide windows"
```

---

### Task 6: Search as a card grid on wide windows

**Files:**

- Modify: `apps/mobile/src/features/search/search-screen.tsx`

**Interfaces:**

- Consumes: `columnCount`, `chunk`, `COLUMN_GAP` (Task 1), `GameGridRow`, `GameRowVariant`, `useMeasuredWidth`, `Screen.groupedFill` (Task 4).
- Produces: nothing new.

- [ ] **Step 1: Rewrite the screen**

Replace `apps/mobile/src/features/search/search-screen.tsx` with:

```tsx
import { SEARCH_QUERY_MIN, type GameSummaryWire } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, StyleSheet } from "react-native";

import { useSearchGames } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameGridRow } from "@/components/game-grid-row";
import { GameRow, type GameRowVariant } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { summarySubtitle } from "@/features/game/format";
import { useDebounced } from "@/hooks/use-debounced";
import { Screen } from "@/theme";
import { chunk, COLUMN_GAP, columnCount } from "@/ui/columns";
import { useMeasuredWidth } from "@/ui/use-measured-width";

const DEBOUNCE_MS = 400;

// A row's first game, so a key survives the column count changing under it.
const keyExtractor = (row: GameSummaryWire[]) => String(row[0]?.id);

export function SearchScreen({ query }: { query: string }) {
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const search = useSearchGames(debounced);
  const router = useRouter();
  const { width, fontScale, onLayout } = useMeasuredWidth();
  const columns = columnCount(width, fontScale);
  const grid = columns > 1;

  const openGame = useCallback((id: number) => router.push(`/search/game/${id}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire[] }) => {
      const game = (summary: GameSummaryWire, variant: GameRowVariant) => (
        <GameRow
          key={summary.id}
          id={summary.id}
          title={summary.name}
          subtitle={summarySubtitle(summary)}
          coverImageId={summary.coverImageId}
          variant={variant}
          onPress={openGame}
        />
      );

      return grid ? (
        <GameGridRow columns={columns}>{item.map((summary) => game(summary, "card"))}</GameGridRow>
      ) : (
        <>{item.map((summary) => game(summary, "row"))}</>
      );
    },
    [openGame, grid, columns],
  );

  if (query.length < SEARCH_QUERY_MIN) {
    return (
      <EmptyState
        title="Fetch a game"
        systemImage="magnifyingglass"
        illustration="explore"
        description="Type a title. Two characters is enough to start."
        fullscreen
      />
    );
  }

  return (
    <QueryBoundary query={search}>
      {(data) => (
        // Rows of `chunk`, not `numColumns`: React Native refuses to change
        // `numColumns` on a mounted list, and remounting by `key` would throw
        // away the scroll position every time the window is resized.
        <FlatList
          style={grid ? styles.groupedList : styles.list}
          contentContainerStyle={[styles.listContent, grid && styles.gridContent]}
          onLayout={onLayout}
          data={chunk(data.items, columns)}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <EmptyState
              title="No games found"
              systemImage="magnifyingglass"
              illustration="explore"
              description={`Nothing in the catalogue matches "${debounced}".`}
            />
          }
        />
      )}
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  list: Screen.fill,
  groupedList: Screen.groupedFill,
  listContent: Screen.listContent,
  gridContent: { paddingTop: COLUMN_GAP },
});
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter mobile check-types && pnpm --filter mobile lint`
Expected: clean.

On the iPad simulator: search "zelda" → card grid (3 landscape / 2 portrait); "zzzzqqq" → "No games found" centred; empty field → "Fetch a game". Tap a card → detail opens inside the Search tab. On iPhone 17 Pro portrait the results are plain rows, as on `main`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/search/search-screen.tsx
git commit -m "feat(mobile): show Search results as a card grid on wide windows"
```

---

### Task 7: Two-column game detail

**Files:**

- Modify: `apps/mobile/src/features/game/game-detail-screen.tsx`

**Interfaces:**

- Consumes: `detailIsSplit`, `COLUMN_GAP` (Task 1), `useMeasuredWidth` (Task 4).
- Produces: nothing new. `Hero`, `EntryActions`, `ExpandableSummary`, `DetailRows`, `Screenshots`, `SimilarGames`, `IgdbAttribution` are not modified.

- [ ] **Step 1: Imports and width**

Add to the imports:

```tsx
import { PlatformColor, ScrollView, Share, StyleSheet, View } from "react-native";
```

(replacing the existing `react-native` import) and

```tsx
import { COLUMN_GAP, detailIsSplit } from "@/ui/columns";
import { useMeasuredWidth } from "@/ui/use-measured-width";
```

Inside `GameDetailScreen`, after `const activeCount = …`:

```tsx
const { width, fontScale, onLayout } = useMeasuredWidth();
const split = detailIsSplit(width, fontScale);
```

- [ ] **Step 2: Compose the two layouts**

Replace the `<QueryBoundary query={game}>…</QueryBoundary>` block with:

```tsx
<QueryBoundary query={game}>
  {(data) => {
    const overview = (
      <>
        <Hero game={data} />

        <EntryActions
          entry={data.backlogEntry}
          premium={premium}
          activeCount={activeCount}
          onBlocked={() => router.push("/paywall")}
          onUpsert={(input) => upsert.mutate(input)}
        />

        {data.summary === null ? null : <ExpandableSummary summary={data.summary} />}
      </>
    );

    return (
      <ScrollView
        style={styles.scroll}
        onLayout={onLayout}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {/* Wide: what you act on to the left, facts to the right. The
                  shelves stay full width below either way — horizontal
                  scrolling is the one part that already uses the width. */}
        {split ? (
          <View style={styles.split}>
            <View style={styles.primary}>{overview}</View>
            <View style={styles.secondary}>
              <DetailRows game={data} />
            </View>
          </View>
        ) : (
          overview
        )}

        <Screenshots screenshots={data.screenshots} />

        {split ? null : <DetailRows game={data} />}

        <SimilarGames gameId={gameId} onPressGame={onOpenGame} />

        <IgdbAttribution slug={data.slug} />
      </ScrollView>
    );
  }}
</QueryBoundary>
```

- [ ] **Step 3: Styles**

Replace `styles` with:

```ts
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  split: { flexDirection: "row", gap: COLUMN_GAP },
  // 3:2 so the 132pt cover and a three-line title are not squeezed at 700pt.
  primary: { flex: 3 },
  // Hero's own top inset, so the two columns start level.
  secondary: { flex: 2, paddingTop: 8 },
});
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter mobile check-types && pnpm --filter mobile lint`
Expected: clean.

On iPad Pro 13" landscape, open a game with a summary, screenshots and similar games: left column hero + status/rating buttons + summary, right column the details card, then screenshots and similar games full width. Change status → the button updates. Drag Split View to ⅓: single column in today's order. iPhone 17 Pro portrait: identical to `main`. Settings → Accessibility → Display & Text Size → Larger Text at AX3 on iPad portrait (834–1032pt): single column (Review Focus 3).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/game/game-detail-screen.tsx
git commit -m "feat(mobile): lay out game detail in two columns on wide windows"
```

---

### Task 8: Sheets instead of full-screen modals on wide windows

**Files:**

- Modify: `apps/mobile/src/app/_layout.tsx`
- Modify: `apps/mobile/src/app/paywall.tsx:11` (comment)
- Modify: `apps/mobile/src/components/profile-toolbar.tsx`

**Interfaces:**

- Consumes: `prefersSheet` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Root stack**

In `apps/mobile/src/app/_layout.tsx`:

Change the `react-native` import to `import { useColorScheme, useWindowDimensions, View } from "react-native";` and add `import { prefersSheet } from "@/ui/columns";` with the other `@/` imports.

In `RootLayout`, after `const colorScheme = useColorScheme();`:

```tsx
// Read at presentation time. An open sheet keeps its style if the window
// later resizes; UIKit already turns a page sheet full screen in compact width.
const { width } = useWindowDimensions();
const modal = prefersSheet(width) ? "pageSheet" : "fullScreenModal";
```

Replace the two modal screens:

```tsx
                      <Stack.Screen name="shared" options={{ presentation: modal }} />
                      <Stack.Screen name="paywall" options={{ presentation: modal }} />
```

and update the comment above the `Stack` so it says `/shared` is "presented as a modal over it — a page sheet on a wide window, full screen otherwise" instead of "a full-screen modal over it".

- [ ] **Step 2: Paywall comment**

In `apps/mobile/src/app/paywall.tsx`, replace

```ts
/** A dismissible `fullScreenModal` from `_layout.tsx` — an offer, not a wall. */
```

with

```ts
/** A dismissible modal from `_layout.tsx` — an offer, not a wall. */
```

- [ ] **Step 3: Profile**

In `apps/mobile/src/components/profile-toolbar.tsx`:

Change `import { Modal, Pressable, StyleSheet } from "react-native";` to `import { Modal, Pressable, StyleSheet, useWindowDimensions } from "react-native";` and add `import { prefersSheet } from "@/ui/columns";` after the `@/api/hooks` import.

In the component, after `const premium = useIsPremium();`:

```tsx
const { width } = useWindowDimensions();
```

and on the `Modal`:

```tsx
        presentationStyle={prefersSheet(width) ? "pageSheet" : "fullScreen"}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter mobile check-types && pnpm --filter mobile lint`
Expected: clean.

On iPad Pro 13" full screen:

- Tap the avatar → Clerk's profile appears as a page sheet. Swipe it down → it dismisses, and tapping the avatar again opens it again (proves `onRequestClose` reset `isOpen`; Review Focus 5). If swipe-dismiss leaves `isOpen` stuck `true`, add `onDismiss={() => setIsOpen(false)}` to the `Modal` and re-test.
- Tap "N of M slots used" on Home (free account) → RevenueCat paywall as a page sheet; dismiss works.
- Share a link to Barklog from Safari → `shared` opens as a page sheet; picking a game pushes detail inside the sheet.
- Split View ⅓: all three open full screen.
- iPhone 17 Pro: all three full screen, as on `main`.

If Clerk's or RevenueCat's view renders broken in a sheet, revert that one presentation to full screen and record it in Task 9's results (spec §2.6).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/_layout.tsx apps/mobile/src/app/paywall.tsx apps/mobile/src/components/profile-toolbar.tsx
git commit -m "feat(mobile): present profile, paywall and share as sheets on wide windows"
```

---

### Task 9: Device verification and checklist

**Files:**

- Modify: `docs/mobile-device-verification.md` (append a section)

**Interfaces:**

- Consumes: everything above.
- Produces: the recorded result of spec §2.7's manual matrix.

- [ ] **Step 1: Append the checklist**

Append to `docs/mobile-device-verification.md`:

```markdown
## iPad and adaptive layout (2026-10-12)

Spec: `docs/superpowers/specs/2026-10-12-ipad-duo-adaptive-layout-design.md` §2.
Needs a fresh `pnpm --filter mobile prebuild` (app.json and expo-haptics changed).
There is no iPhone Duo simulator before Xcode 27.1; dragging the iPad Split View
divider is the stand-in for folding.

| Device              | Pose                             | Home | Search | Detail | Sheets | Notes |
| ------------------- | -------------------------------- | ---- | ------ | ------ | ------ | ----- |
| iPad Pro 13" (M5)   | landscape, full, sidebar open    |      |        |        |        |       |
| iPad Pro 13" (M5)   | landscape, full, sidebar hidden  |      |        |        |        |       |
| iPad Pro 13" (M5)   | portrait, full                   |      |        |        |        |       |
| iPad Pro 13" (M5)   | ½ Split View                     |      |        |        |        |       |
| iPad Pro 13" (M5)   | ⅓ Split View                     |      |        |        |        |       |
| iPad Pro 11" (M5)   | landscape + portrait, full       |      |        |        |        |       |
| iPad Pro 11" (M5)   | ½ Split View                     |      |        |        |        |       |
| iPad mini (A17 Pro) | portrait full (expect 2 columns) |      |        |        |        |       |
| iPad mini (A17 Pro) | ⅓ Split View (expect 1 column)   |      |        |        |        |       |
| iPhone 17 Pro       | portrait (must match main)       |      |        |        |        |       |
| iPhone 17 Pro Max   | landscape (expect 2 columns)     |      |        |        |        |       |

For every row: Home with and without a filter, Home empty state, Search
empty / results / no results, game detail, paywall, profile, shared (via the
share extension), onboarding (reset it via the dev menu or reinstall),
screenshot viewer rotation, pull to refresh, Dynamic Type at default and AX3.

Live resize: with Home scrolled halfway and a game detail pushed in the
Search tab, drag the divider full → ½ → ⅓ → full. Expect columns to re-flow,
no crash, scroll position kept, the Search tab's detail still on top.

Haptic (physical iPhone only — simulators do not play haptics): add a game →
buzz; change Playing → Completed → buzz; change only the rating → no buzz.

Release: 13" iPad screenshots for App Store Connect; version bump — this is a
native change and cannot ship over the air.
```

- [ ] **Step 2: Run the matrix**

For each row, boot the simulator and run:

```bash
cd apps/mobile && APP_VARIANT=development npx expo run:ios --device "<device name from the table>"
xcrun simctl io booted screenshot /tmp/barklog-<device>-<pose>.png
```

Fill each cell with ✅ or a short description of the defect. Anything broken in Stage 1's scope is fixed now, as its own `fix(mobile): …` commit, before this task is closed. Onboarding clipping in iPhone landscape counts as in scope (spec §5).

- [ ] **Step 3: Full check**

Run: `pnpm --filter mobile test && pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm format:check`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add docs/mobile-device-verification.md
git commit -m "docs: record iPad adaptive layout verification"
```
