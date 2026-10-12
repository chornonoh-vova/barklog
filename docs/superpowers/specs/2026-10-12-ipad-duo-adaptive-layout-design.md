# iPad, iPhone Duo and HIG Gaps — Design

**Date:** 2026-10-12
**Status:** Draft, awaiting review

## 1. Purpose

Barklog ships as an iPhone-only, portrait-only app (`supportsTablet: false`,
`orientation: "portrait"`). On iPad it runs as a scaled-up phone. On iPhone
Duo the inner display ignores the orientation lock and resizes the app live
as it folds and unfolds, so the app will be asked to fill a regular-width
window whether we opt in or not.

A review against Apple's Human Interface Guidelines found the layout gaps
above plus a handful of general ones — an unconfirmed destructive action, a
text glyph VoiceOver reads badly, no accessibility-size reflow, no context
menus, nothing for pointer or keyboard. This document covers all of it in
three stages, each shippable on its own and each getting its own
implementation plan:

1. **Adaptive layout** — iPad and iPhone Duo support: width-based columns,
   the sidebar-adaptable tab bar, a two-column game detail, sheets on wide
   windows — plus a haptic on status change, pulled forward from polish.
2. **HIG gaps** — destructive confirmation, rating accessibility,
   accessibility-size reflow, context menus and previews, swipe actions,
   pointer and keyboard.
3. **Polish and Duo verification** — section header style, recent
   searches, and a full pass on the iPhone Duo simulator once Xcode 27.1 is
   installed.

### Guiding rules (all stages)

- **Lay out from available width, never from device or orientation.** Apple's
  iPhone Duo guidance is explicit: no idiom checks, no orientation checks, no
  `UIScreen.main`. In React Native that means `useWindowDimensions()` or, better,
  a view's own `onLayout` width — never `Dimensions.get("screen")`.
- **The iPhone experience does not change in Stage 1.** Every Stage 1 change
  is gated on width; a portrait iPhone renders exactly what it renders today.
- **Layout decisions are pure functions with tests.** Column counts,
  thresholds and chunking live in plain `.ts` modules covered by vitest, like
  `sections.ts` and `slots.ts` today. Components only read the result.

### Non-goals

- **Native split view.** `expo-router/split-view` must be the outermost
  navigator and cannot live inside a tab, and its extra columns are static
  views rather than routes. It fits a sidebar-navigation shell, not a
  list/detail inside each tab. Rejected in favour of `sidebarAdaptable` tabs
  plus columns.
- **Multiple windows / scenes on iPad.** One window is enough.
- **Mac Catalyst / "Designed for iPad" on Mac.** Not tested, not promised.
- **Explore redesign.** Its horizontal shelves already use extra width by
  showing more tiles.
- **Account deletion discoverability** (App Review keeps missing it behind
  avatar → Security). Real, but a separate spec.

---

## 2. Stage 1 — Adaptive layout

### 2.1 Opting in

`apps/mobile/app.json`:

```jsonc
"orientation": "default",          // was "portrait"
"ios": { "supportsTablet": true }  // was false
```

- iPad multitasking (Split View, Slide Over, Stage Manager windows) requires
  all orientations; `UIRequiresFullScreen` is not set.
- iPhone gains landscape. Apple recommends it for iPhone Duo's outer display
  ("tent" pose), and every screen must survive it anyway once the inner
  display resizes us.
- Side effect: App Store Connect requires 13" iPad screenshots before the next
  submission. Tracked in the Stage 1 release checklist (§2.8).

`src/app/(tabs)/_layout.tsx`:

```tsx
<NativeTabs minimizeBehavior="onScrollDown" sidebarAdaptable>
```

On iPadOS this is the floating tab bar that can be expanded into a sidebar.
Its documentation says it has no effect on iPhone; on iPhone Duo we rely on
the system laying the tab bar out vertically, which Apple says it does. That
is verified in Stage 3 (§4.4).

### 2.2 Column count — `src/ui/columns.ts`

```ts
export const CARD_MIN_WIDTH = 320;
export const GUTTER = 16;      // outer margin, matches the 16pt list inset used everywhere
export const COLUMN_GAP = 12;
export const MAX_COLUMNS = 3;
const MAX_TEXT_SCALE = 1.6;

/** How many cards fit side by side in `width` points. */
export function columnCount(width: number, fontScale: number): number;

/** Splits `items` into rows of `columns`; the last row may be short. */
export function chunk<T>(items: readonly T[], columns: number): T[][];
```

`columnCount` is
`clamp(floor((width − 2·GUTTER + COLUMN_GAP) / (CARD_MIN_WIDTH · min(fontScale, MAX_TEXT_SCALE) + COLUMN_GAP)), 1, MAX_COLUMNS)`.

- Scaling the minimum card width by `fontScale` means large Dynamic Type sizes
  drop to fewer, wider cards instead of truncating titles. The cap stops the
  accessibility sizes from forcing a single column on a 13" iPad.
- Non-finite or non-positive widths return 1.

Expected results (test table):

| Width | Context | fontScale | Columns |
|---|---|---|---|
| 402 | iPhone portrait | 1.0 | 1 |
| 440 | iPhone Pro Max portrait | 1.0 | 1 |
| 744 | iPad mini portrait | 1.0 | 2 |
| 956 | iPhone Pro Max landscape | 1.0 | 2 |
| 1050 | 13" iPad landscape, sidebar open | 1.0 | 3 |
| 1376 | 13" iPad landscape, sidebar hidden | 1.0 | 3 (capped) |
| 744 | iPad mini portrait | 1.35 | 1 |
| 1376 | 13" iPad landscape | 3.0 | 2 (scale capped at 1.6) |
| 0 / NaN | before layout | — | 1 |

`src/ui/use-measured-width.ts`:

```ts
export function useMeasuredWidth(): {
  width: number;
  fontScale: number;
  onLayout: (e: LayoutChangeEvent) => void;
};
```

Screens pass the result to `columnCount` (lists) or `detailIsSplit` (detail),
so one hook serves both and the decisions stay pure.

- Starts from `useWindowDimensions().width` so the first frame is already
  roughly right (no rows→cards flash on iPad), then switches to the list's own
  measured width from `onLayout`. The measured width matters: an open iPad
  sidebar takes ~320pt the window width does not know about.
- `fontScale` comes from `useWindowDimensions()` so a Dynamic Type change while
  the app is open re-renders, matching what `GameTile` already does.

### 2.3 Rows of cards on Home and Search

Both screens render rows of `columns` items built with `chunk`.

**Home (`features/backlog/backlog-screen.tsx`)** stays a `SectionList`.
`toSections` is unchanged; a new pure step maps each section's `data` to
`chunk(data, columns)`, so a section item becomes a row of up to `columns`
entries. `renderItem` renders a horizontal `View` of `GameRow`s with
`COLUMN_GAP` between them and `GUTTER` padding; a short last row keeps empty
flex slots so cards keep their width. Sticky section headers keep spanning the
full width. `keyExtractor` for a row is its first item's `gameId`.

**Search (`features/search/search-screen.tsx`)** changes from a plain
`FlatList` of items to a `FlatList` of chunked rows, using the same row
renderer. Not `numColumns`: React Native refuses to change `numColumns` on a
mounted list, and remounting via `key` throws away scroll position every time
iPhone Duo folds or an iPad Split View divider moves.

Both share one renderer, `src/components/game-grid-row.tsx`, so the
gap/padding/empty-slot rules live in one place.

VoiceOver reads cards left to right, then down — the natural order of a row
`View` — so no `accessibilityOrder` work is needed.

### 2.4 Card variant — `components/game-row.tsx`

`GameRow` gains `variant: "row" | "card"` (default `"row"`).

- **row** — exactly today's look.
- **card** — same content (44pt cover, title, subtitle), but: rounded
  rectangle (`borderRadius: 12`), `secondarySystemGroupedBackground` fill, no
  chevron, no hairline separator, 12pt inner padding. Pressed state darkens to
  `tertiarySystemGroupedBackground`.

The screen picks `card` when `columns >= 2`. In card mode the list background
becomes `systemGroupedBackground`, and so must the opaque sticky section
header (`SectionHeader.container`), or the header shows as a white band.
`theme.ts` gets a `grouped` variant of `Screen.fill` and `SectionHeader.container`
rather than ad-hoc overrides.

One column stays plain rows on purpose: plain lists on compact width,
grouped content when there is room, is the iOS convention, and it keeps the
iPhone untouched.

### 2.5 Two-column game detail — `features/game/game-detail-screen.tsx`

`src/ui/columns.ts` also exports:

```ts
export const DETAIL_SPLIT_MIN_WIDTH = 700;
export function detailIsSplit(width: number, fontScale: number): boolean;
```

`detailIsSplit` is `width >= DETAIL_SPLIT_MIN_WIDTH * min(fontScale, MAX_TEXT_SCALE)`.
The screen measures its own `ScrollView` width with `onLayout` (initial value
from the window, as in §2.2).

When split:

```
┌───────────────────────────┬────────────────────────┐
│ Hero                      │ DetailRows             │
│ EntryActions              │                        │
│ ExpandableSummary         │                        │
└───────────────────────────┴────────────────────────┘
Screenshots   (full-width horizontal shelf)
Similar Games (full-width horizontal shelf)
IgdbAttribution
```

- Left column `flex: 3`, right column `flex: 2`, `COLUMN_GAP` between,
  top-aligned. Ratio chosen so the hero cover plus a three-line title is not
  squeezed at 700pt.
- Shelves stay full-width below: horizontal scrolling is the one thing that
  already benefits from width.
- Not split: today's single column, unchanged order.

The children (`Hero`, `EntryActions`, `DetailRows`, …) are not modified; only
the screen's composition changes. `DetailRows` must not assume full screen
width — checked during implementation.

### 2.6 Presentations on wide windows

A shared helper in `src/ui/columns.ts`:

```ts
export const SHEET_MIN_WIDTH = 700;
export function prefersSheet(windowWidth: number): boolean;
```

- **Profile** (`components/profile-toolbar.tsx`): the `Modal` uses
  `presentationStyle={prefersSheet(width) ? "pageSheet" : "fullScreen"}`.
- **Paywall and shared** (`app/_layout.tsx`): `Stack.Screen` `options` read
  the window width in `RootLayout` and use `"pageSheet"` when wide,
  `"fullScreenModal"` otherwise. Both use `pageSheet`, not `formSheet`:
  RevenueCat's paywall needs the height, and `shared` hosts a nested `Stack`,
  which react-native-screens' detent-based `formSheet` does not handle well.
- **Screenshot viewer** stays full screen at every width — it is media.

The style is chosen at presentation time from the window width. A sheet that
is already open when the window resizes keeps its style; UIKit adapts it
(a page sheet becomes full screen in compact width on its own).

Open risk: Clerk's `UserProfileView` and RevenueCat's paywall have only been
seen full screen. If either renders badly in a sheet, that presentation stays
`fullScreen` and the finding goes in the plan's notes.

### 2.6a Haptic on status change

Changing a game's status — adding it to the backlog, or moving it between
Playing, Waiting, Completed and Abandoned — plays one success notification
haptic (`expo-haptics`, new dependency). Nothing else does: not a rating-only
change, not removal, not navigation.

- **Where:** in `useUpsertBacklogEntry` (`api/hooks.ts`), at optimistic
  apply time (`onMutate`). The UI already shows the new status instantly; a
  haptic that waits for the server would arrive after the change it
  describes. If the request then fails, the existing error alert and
  rollback are the correction — no second haptic.
- Living in the mutation hook means every path that changes status gets it
  for free, including Stage 2's context menu.
- **Decision is pure:** `features/backlog/status-haptic.ts` —
  `shouldPlayStatusHaptic(previous: BacklogStatus | null | undefined, next:
  BacklogStatus): boolean` is `previous !== next`. `undefined` (detail not
  cached) counts as a change: the user deliberately picked a status.
- iOS already mutes haptics when the user turned System Haptics off.

### 2.7 Testing

**Automated (vitest, `apps/mobile/test/`):**

- `columns.test.ts` — the §2.2 table, `chunk` (empty, exact multiple, short
  last row, `columns` of 1), `detailIsSplit` around 700 and with
  `fontScale`, `prefersSheet` around 700.
- `sections.test.ts` — extended for the chunked section mapping.
- `status-haptic.test.ts` — add, move, rating-only (same status), unknown
  previous.

**Manual (Xcode 27.0 simulators, recorded in
`docs/mobile-device-verification.md`):**

| Device | Poses |
|---|---|
| iPad Pro 13" (M5) | landscape + portrait; full screen, ½ and ⅓ Split View; sidebar open and closed |
| iPad Pro 11" (M5) | landscape + portrait; full screen and ½ Split View |
| iPad mini (A17 Pro) | portrait full screen (2 columns), ⅓ Split View (1 column) |
| iPhone 17 Pro / Pro Max | portrait (unchanged), landscape |

For each: Home with and without a filter, Home empty state, Search empty /
results / no results, game detail split and not, paywall, profile, shared
(via the share extension), onboarding, screenshot viewer rotation, pull to
refresh, Dynamic Type at default and AX3. Dragging the iPad Split View divider
live is the stand-in for iPhone Duo folding: columns and detail split must
change without losing scroll position or the navigation stack.

### 2.8 Release checklist

- 13" iPad screenshots for App Store Connect (and, optionally, the landing
  page).
- `apps/mobile/app.json` version bump — `runtimeVersion` follows
  `appVersion`, and `supportsTablet`/`orientation` are native changes, so this
  cannot ship as an OTA update.

---

## 3. Stage 2 — HIG gaps

Each item is independent; the plan may order them freely.

### 3.1 Confirm "Remove from Backlog"

Today the toolbar menu calls `remove.mutate()` immediately, discarding the
status and rating. The HIG asks destructive actions that cannot be undone to
confirm.

- `features/game/confirm-remove.ts` — `confirmRemove(gameName, onConfirm)`
  shows `Alert.alert` with title `Remove “<name>”?`, message `Its status and
  rating will be lost.`, and buttons `Cancel` (cancel style) and `Remove`
  (destructive style).
- Used by the detail toolbar menu, the row context menu (§3.4) and the swipe
  action (§3.5), so all three paths behave the same.
- Undo was considered and rejected: iOS has no system toast to host it, and a
  custom one is more UI than the problem deserves.

### 3.2 Rating star for VoiceOver

The literal `★` is read as "black star".

- `EntryActions` rating `Menu`: `systemImage` `star` when unrated and
  `star.fill` when rated, label is the number only (or `Rate` when unrated).
  The `★ ` prefix and `ratingButtonLabel`'s empty-string case go away.
- `rowSubtitle` keeps `★9` visually (it is compact and readable), but
  `features/game/format.ts` gains `rowSubtitleSpoken` returning
  `Playing, rated 9 out of 10` (using `RATING_MAX` from `@repo/contracts`), and `GameRow`'s
  `accessibilityLabel` uses it. `format.test.ts` covers both.

### 3.3 Reflow at accessibility text sizes

The HIG asks horizontal layouts to stack vertically at the accessibility text
sizes so text gets the full width.

- `src/ui/text-size.ts` — `isAccessibilitySize(fontScale)` is
  `fontScale >= 1.6` (iOS's first accessibility size, AX1, reports about
  1.65). Tested.
- **Hero:** cover above the text block, centred, at accessibility sizes;
  side-by-side otherwise.
- **GameRow:** subtitle `numberOfLines` 1 → 2 at accessibility sizes; cover
  stays leading (a 44pt cover does not crowd the text).
- **EntryActions:** `HStack` → `VStack` at accessibility sizes so two large
  capsule buttons do not truncate.
- **StatusFilter:** the `Show` label and the menu stack vertically.

Checked at AX3 and AX5 on iPhone and iPad.

### 3.4 Context menus with previews

Long-press (or right-click / two-finger click on iPad) on any game in a list
shows a preview of its detail screen and a menu. Built on expo-router's
`Link` with `Link.Trigger`, `Link.Preview` and `Link.Menu` / `Link.MenuAction`
(present in expo-router 57), which also makes the row a real link —
tapping navigates through the `href` instead of `router.push`.

- **GameRow and GameTile** take `href` instead of `onPress(id)`; each screen
  passes its own tab-scoped detail route (`/game/[id]`, `/search/game/[id]`,
  `/explore/game/[id]`), preserving the rule that a push stays in its tab.
- **Menu when the game is in the backlog** (Home, and Search/Explore results
  that carry an entry): `Status ▸` submenu with the four statuses (current one
  checked), `Share`, and `Remove from Backlog…` (destructive → §3.1).
- **Menu when it is not:** `Add to Backlog ▸` submenu with the statuses, and
  `Share`.
- Status changes go through `useUpsertBacklogEntry` and the same
  `wouldExceedSlots` gate as `EntryActions`; a blocked change opens the
  paywall.
- Share reuses `gameShareContent`, which needs a `GameDetailResponse`;
  `features/game/share.ts` gains a summary-shaped overload so rows can share
  without fetching detail first.

Risk: `Link.Preview` mounts the destination route to render the preview.
If that costs a detail fetch per long-press on slow networks, it is
acceptable (the user is about to open it anyway); if preview rendering is
broken under the transparent detail header, ship menus without
`Link.Preview` and record why.

### 3.5 Swipe actions on Home

Single-column Home rows get a trailing swipe action, `Remove`, via
`react-native-gesture-handler`'s `ReanimatedSwipeable` (already a
dependency). It goes through §3.1's confirmation. No full-swipe-to-delete:
a confirmation after a full swipe feels broken.

Cards (2+ columns) get no swipe — swiping cards in a grid is not an iOS
pattern; the context menu covers them. Status changes stay in the context
menu; a swipe that silently advances status is too easy to trigger by
accident.

### 3.6 Pointer

Navigation bar items, tab bar, SwiftUI buttons and menus get pointer effects
from UIKit already. React Native `Pressable` rows, cards, tiles and
screenshots do not.

- First, a timeboxed check (half a day): with `Link.Trigger` from §3.4 in
  place, does the row get a native pointer highlight? If yes, done.
- If not: a local Expo module `modules/pointer-hover` exposing a view that
  adds a `UIPointerInteraction` with the `.highlight` / `.lift` effect, and
  wrap `GameRow`, `GameTile` and the screenshot thumbnails in it.
- If neither works in the timebox, drop it and record the finding; it is not
  worth a fork of `Pressable`.

### 3.7 Hardware keyboard

iPad users with a keyboard expect, and the HIG lists, standard shortcuts.
React Native has no `UIKeyCommand` API on iOS.

- Local Expo module `modules/key-commands` that registers `UIKeyCommand`s on
  the root view controller and emits events to JS; a `useKeyCommand(input,
  modifiers, handler)` hook subscribes while a screen is focused.
- Shortcuts, each shown in the ⌘-hold discoverability overlay with a title:
  - `⌘F` — Find: switch to the Search tab and focus the search bar.
  - `⌘R` — Refresh: refetch the focused tab's queries.
  - `⌘1` / `⌘2` / `⌘3` — Home / Explore / Search (only if `NativeTabs` does
    not already provide these on iPadOS — check first).
  - `Esc` — close the screenshot viewer (sheets already handle it).
- Arrow-key focus through lists is **out of scope**: it needs UIKit's focus
  system on native collection views, which React Native views do not take
  part in.

---

## 4. Stage 3 — Polish and Duo verification

### 4.1 Section header style

iOS 26 plain-list section headers are title case, not uppercased small caps.
`SectionHeader.title` becomes `Type.headline` in `PlatformColor("label")`
without `letterSpacing`, and `backlog-screen.tsx` and the share screen stop
calling `.toUpperCase()`. The count stays as a secondary label. Applies to
both row and card modes.

### 4.2 Haptics

Moved to Stage 1 (§2.6a). Stage 3 only checks it still fires from the
context menu and swipe paths Stage 2 adds.

### 4.3 Recent searches

The Search empty state ("Fetch a game") becomes a list of up to 8 recent
queries with a `Clear` button, falling back to today's empty state when there
are none.

- A query is recorded when the user opens a result from it — not on every
  keystroke.
- `features/search/recents.ts` — `pushRecent(list, query)` (trim,
  case-insensitive de-duplicate, newest first, cap 8) with tests; stored in
  AsyncStorage following `storage/flag.ts`'s pattern.
- Tapping a recent query fills the search bar. Needs `Stack.SearchBar` to
  accept text programmatically; if it cannot, tapping runs the search and
  shows results without filling the field, and the plan records it.
- Recents are local to the device and cleared on sign-out alongside the
  query cache (`should-clear-cache.ts`).

### 4.4 iPhone Duo verification

Needs Xcode 27.1 and the iPhone Duo simulator in Device Hub. Build with the
iOS 27.1 SDK so the app extends to the screen edges.

Matrix: outer display portrait and landscape (tent), inner display open,
inner display ½ Split View, and live open/close/fold transitions on Home,
Search, game detail and the screenshot viewer.

Checks:

- Columns and detail split follow the fold without losing scroll position or
  the navigation stack.
- Tab bar placement on the inner display (vertical per Apple; whether
  `sidebarAdaptable` does anything is recorded).
- Asymmetric safe areas: no content under the status bar or camera region;
  any custom padding reads each inset separately, never assuming left equals
  right.
- Sheets centre on the inner display.
- Onboarding and screenshot viewer in every pose.

Findings that need code become a short follow-up plan; this stage does not
pre-commit to fixes for problems not yet seen.

---

## 5. Risks and open questions

| Risk | Mitigation |
|---|---|
| `sidebarAdaptable` misbehaves with `role="search"` or `minimizeBehavior` | Seen in the first iPad run; fall back to the plain tab bar on iPad (still correct, just less native). |
| Clerk / RevenueCat views break in sheets | Keep that one presentation full screen (§2.6). |
| `Link.Preview` problems under the transparent detail header | Ship menus without previews (§3.4). |
| No pointer API reachable from React Native | Timeboxed; drop and record (§3.6). |
| iPhone Duo behaviour differs from the third-party reports | Stage 3 verifies on Apple's simulator before any Duo-specific code is written. |
| iPhone landscape exposes clipped onboarding pages | Part of Stage 1 manual testing; fix in Stage 1. |
