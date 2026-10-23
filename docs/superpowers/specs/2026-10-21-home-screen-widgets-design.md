# Home Screen Widgets and Instant Home — Design

Mobile 1.3.0. Two features ship together on one branch: iOS home screen widgets
built with `expo-widgets`, and a Home screen that renders cached data instantly.

## Why

Barklog lives on the home screen as an icon only. A widget puts the thing you are
actually playing (or waiting to play) in front of you, and one tap takes you to the
game. The same work — writing a derived copy of the backlog somewhere durable —
also lets the app stop showing a full-screen spinner every launch.

## Goals

- One configurable widget, two sizes. The user picks the section it shows:
  Playing, Waiting, Completed, or Abandoned.
- **Small** shows one game. **Medium** shows a shelf of three.
- Every game on a widget deep-links to Home → Game Details for that game.
- An empty section shows the mascot.
- Home renders the last-known backlog immediately on launch; revalidation happens
  in the background behind a small floating "Updating…" pill.

## Non-goals

- Android widgets (the app is iOS-only).
- Large / extra-large / Lock Screen (accessory) families.
- Live Activities, interactive widget buttons (changing status from the widget).
- Background refresh from the widget extension. The widget updates when the app
  runs. Staleness after editing on another device is accepted.
- Stats / counts widget, multi-section grid widget (from the inspirations) — maybe later.

## Anti-goals

- **A second source of truth.** TanStack Query is the only source of truth. Widget
  data is a one-way, derived, trimmed copy pushed from the query cache. The widget
  never fetches, and nothing reads the widget snapshot back into the app.
- Cramped typography. Cover is primary, title secondary, rating tertiary; if
  something has to go, the rating goes first.
- A widget tap that lands in Explore/Search's `game/[id]` stack instead of Home's.

## Constraints (verified)

- Expo SDK 58, `@expo/ui` 58.0.21, expo-router 58, iOS only. `expo-widgets` is
  **not yet installed**; latest is 58.0.21. Needs a dev build (CNG), not Expo Go.
- `expo-widgets` widget components start with the `'widget'` directive and run in an
  isolated runtime: `@expo/ui/swift-ui` components only, no imports, no hooks, no
  async, no module-scope values. Data arrives only as props (`updateSnapshot`) plus
  `environment` (`colorScheme`, `widgetRenderingMode`, `configuration`, `widgetFamily`).
- The widget cannot load remote images or read the app sandbox. Covers must be
  downloaded by the app into `widgetsDirectory` (app-group container) and referenced
  by `file://` path.
- User configuration: `ios.configuration` enum parameter, values arrive in
  `environment.configuration`. iOS 17+.
- Taps: `@expo/ui/swift-ui` exports `Link` (per-view destination, works in medium)
  and the `widgetURL` modifier (whole widget; the only option for small).
- App group already exists and is per-variant: `group.${bundleIdentifier}`
  (`apps/mobile/app.config.js:35-48`). Bundle IDs: `gg.barklog.app`, `.dev`, `.preview`.
  The share extension's bundle-id/app-group rewrite (`app.config.js:78-85`) is the
  pattern to follow for the widget target.
- Scheme `barklog`. `src/app/+native-intent.ts` passes non-share paths through, so
  `barklog://game/123` reaches expo-router as `/game/123`.
- Four `game/[id]` routes exist: `(tabs)/(home)`, `(tabs)/explore`, `(tabs)/search`,
  `shared`. Home pushes `/game/${id}` from `backlog-screen.tsx:70`.
- Data: `useBacklog(status, sort)` → `GET /api/backlog`, unpaginated
  (`BacklogListResponse { items }`). Home's unfiltered query is
  `keys.backlog.list(undefined, "updated_at")` and contains every section.
  Statuses: `waiting | playing | completed | abandoned`. User rating `number | null`
  (1–10). Title is `game.name`; cover is `game.coverImageId` (IGDB id → URL via
  `src/igdb-image.ts`). Covers are 3:4 (`COVER_ASPECT`).
- Mascot art is WebP (`assets/illustrations/barklog-mascot-*.webp`, 1024²).
- Localized: en, uk, ru, de, es. Per-status empty copy already exists
  (`backlog.emptyFilter.<status>.*`, `features/backlog/empty-states.ts`).
- Styling convention: only hex literal is `Brand.tint`; everything else is iOS
  dynamic colours.
- Memory notes that apply: `@expo/ui` 58 `Host` defaults to top-leading (in-app
  only); no native modules dir.

## Decided by the user

- Widget is one configurable widget; section choice: Playing / Waiting / Completed / Abandoned.
- Sizes: small (one game) and medium (shelf). Layouts per the mockups below.
- Each game deep-links to Home → Game Details.
- Empty state uses the mascot.
- Background: **system background** (variant A) — plain light/dark, covers carry the colour.
- Freshness: widget updates whenever the app runs; that's fine.
- Instant Home via persisted query cache + small floating loading pill, shipped together
  in 1.3.0.
- TanStack Query is the single source of truth; widget data is derived from it.

## Design

### Widget layouts

Background: system background (white / near-black via `environment.colorScheme`).
Header: section name, small caps, secondary weight, top-left. Medium also shows the
section count top-right.

```
Small                       Medium
┌─────────────────┐         ┌──────────────────────────────────────┐
│ PLAYING         │         │ PLAYING                         5    │
│    ┌───────┐    │         │  ┌──────┐   ┌──────┐   ┌──────┐      │
│    │ COVER │    │         │  │COVER │   │COVER │   │COVER │      │
│    └───────┘    │         │  └──────┘   └──────┘   └──────┘      │
│ Elden Ring      │         │  Elden Ri…   Astro Bot   Balatro     │
│ ★ 8             │         │  ★ 8         ★ 9                     │
└─────────────────┘         └──────────────────────────────────────┘
```

- Cover: 3:4, rounded corners, fills the available height after header and text.
- Title: one line, truncated with an ellipsis.
- Rating line: `★ <n>` only when the user rated the game; omitted otherwise (no
  placeholder text, but medium keeps titles aligned on one baseline).
- If the layout can't fit the rating line (large Dynamic Type), drop it first.
- Medium with fewer than 3 games: show what exists, left-aligned; don't stretch.
- iOS 18 tinted/accented mode (`widgetRenderingMode === 'accented'`): covers use
  `widgetAccentedRenderingMode` so they render sensibly; text follows the system.

Empty section (both sizes):

```
┌─────────────────────┐
│ WAITING             │
│      [mascot]       │
│ Nothing waiting     │
│ yet.                │
└─────────────────────┘
```

Copy reuses/derives from `backlog.emptyFilter.<status>` (shortened if needed for
the widget). Medium places mascot left, text right, or centered — builder's call.

Signed-out / never-opened state: mascot + "Open Barklog to see your backlog."
(This also covers the widget being added before the app ever wrote a snapshot.)

### Configuration

`ios.configuration` with one enum parameter `section`, values
`playing | waiting | completed | abandoned`, default `playing`. Display names are
static strings in config; localizing them is a nice-to-have if `expo-widgets`
supports it (check; otherwise English names are acceptable for 1.3.0).

Below iOS 17 configuration is unavailable; the widget shows the default (Playing).
Check the app's deployment target — if it is already 17+, this is moot.

### Taps / deep links

- Small: `widgetURL("barklog://game/<id>")` on the root view. Empty/signed-out:
  `widgetURL("barklog://")` (opens the app on Home).
- Medium: each cover+title column is wrapped in `Link destination="barklog://game/<id>"`.
  The rest of the widget (header) uses `widgetURL` to open Home filtered to that
  section — this needs Home to accept a section from the URL (see below).
- Routing must land on **Home's** `game/[id]` with Home underneath (so Back returns to
  Home). Approach is the builder's call; options: a distinct URL handled in
  `+native-intent.ts` that maps to the Home stack explicitly, or confirming
  expo-router already resolves `/game/<id>` to the `(home)` group (first group wins)
  and that `unstable_settings.initialRouteName` gives a Back target. Must be verified
  on device for both cold start and warm start, from each tab.
- Home section filter from URL: Home's `filter` is local `useState` today. Add a way
  to open Home with a filter preselected (e.g. a `status` search param read on
  focus). Keep it minimal.

### Widget data: derived snapshot

A single module (e.g. `src/widgets/sync.ts`) owns the derivation. Trigger: whenever
the **unfiltered** backlog list query (`keys.backlog.list(undefined, "updated_at")`)
has new data — subscribe via the QueryClient's query cache, not inside a screen —
plus on sign-out.

Derivation (pure function, unit-testable):

```ts
type WidgetGame = { id: number; name: string; rating: number | null; cover: string | null };
type WidgetSection = { count: number; games: WidgetGame[] /* ≤3, by updatedAt desc */ };
type WidgetSnapshot = {
  signedIn: boolean;
  sections: Record<BacklogStatus, WidgetSection>;
  strings: { /* localized header + empty copy per status, signed-out copy */ };
};
```

- Group items by `status`, sort by `updatedAt` desc, keep top 3 per section,
  `count` = full section length.
- Localized strings are computed in the app (widget runtime has no i18n) and passed
  in the snapshot.
- Covers: for each kept game with a `coverImageId`, download
  `t_cover_big_2x` (or a smaller size that is sharp at widget size — builder's call)
  into `widgetsDirectory/covers/<imageId>.jpg` if not already there; `cover` is the
  `file://` path, or `null` if missing/failed (widget shows a neutral placeholder).
  Delete cover files no longer referenced by the snapshot.
- Push with `updateSnapshot(snapshot)`. Skip the push if the derived snapshot is
  deep-equal to the last one pushed (avoid widget reload churn).
- Sign-out / account switch: hook into the existing `userId`-keyed logic in
  `src/auth/auth-gate.tsx` (`should-clear-cache.ts`), not an `isSignedIn` edge —
  `setActive` swaps users with `isSignedIn` true throughout. Wherever recents are
  cleared (`shouldClearRecents`, which also covers a session revoked while the app
  was closed), also push `{ signedIn: false, ... }`, delete cached covers, and clear
  the persisted query cache. The next user's fresh fetch then repopulates the widget.
  *(Builder-check answer, settled from the code.)*
- Data from a *filtered* Home query is ignored (it only has one section). Mutations
  already invalidate `keys.backlog.all`, so the unfiltered query refetches when Home
  is mounted; if it is not observed, consider refetching it on mutation success so
  the widget stays current — builder's call.

The widget component picks `snapshot.sections[environment.configuration.section]`
and renders small or medium by `environment.widgetFamily`.

### Mascot asset

Export a PNG of the mascot (default or backlog variant — builder's call, the
"backlog" one is used for empty filters in-app) at the size needed, and get it into
the widget. Preferred: copy it into `widgetsDirectory` at app start alongside covers
(no extension asset catalog plumbing). Alternative: bundle it into the widget target
via the config plugin if supported.

### Config & build

- `npx expo install expo-widgets`; add plugin to `app.json` with one widget entry
  (name e.g. `BacklogWidget`, displayName "Barklog", description,
  `ios.supportedFamilies: ["systemSmall", "systemMedium"]`, `ios.configuration`).
- `app.config.js`: set the plugin's `bundleIdentifier` to `${bundleId}.<WidgetTarget>`
  and `groupIdentifier` to the per-variant app group, matching the share extension.
- EAS: the widget extension target needs to be registered like the share extension
  (`extra.eas.build.experimental.ios.appExtensions`) so credentials/provisioning are
  generated for all three variants.
- Bump app version to 1.3.0.

### Instant Home (persisted query cache)

- Add `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister`
  (AsyncStorage is already a dependency). Wrap with `PersistQueryClientProvider`.
- Persist only backlog queries (`keys.backlog.*`) and maybe stats/game details —
  builder's call; search must not be persisted. Set `gcTime` ≥ `maxAge` for persisted
  queries. Use a `buster` tied to the app version so wire-shape changes don't
  rehydrate stale shapes.
- Persisted data is per-user: clear the persisted cache on sign-out and when the
  Clerk user id changes.
- Home: the full-screen `LoadingState` only appears when there is no data at all
  (true first launch). When showing cached data while `isFetching`, show a small
  floating "Updating…" pill (top, below the nav bar, capsule, system material,
  spinner + text, fades in/out; respects Reduce Motion). Pull-to-refresh keeps its
  native spinner for user-initiated pulls; background refetches never show the
  RefreshControl spinner.
- Widget sync treats rehydrated data like any other data: whenever the unfiltered
  list query has data, derive and push, deduped against the last push *in memory*
  (nothing is read back from the widget, no extra persisted flag). Rehydrated data
  is the last successful fetch — what the widget already shows — so re-pushing it
  is harmless, and it fills the widget on the first launch after upgrading even if
  the network is down. *(My call, from the builder check.)*

## Left to the builder

- Exact spacing, font sizes, corner radii, within "cover primary, title secondary,
  rating tertiary".
- Medium empty-state arrangement.
- Deep-link routing mechanism (as long as it lands on Home's stack, cold & warm).
- Cover size variant, file naming, cleanup timing.
- Which queries get persisted beyond the backlog list.
- Pill visuals within "small, floating, unobtrusive".
- Testing: unit tests for the snapshot derivation; on-device verification of
  widget rendering, configuration, light/dark/tinted, deep links.

## Release & gating (user-decided)

- Widgets are **free** for everyone — no premium gating, no locked state.
- Everything ships in **one PR** as 1.3.0: widgets and Instant Home together.

## Open risks

- `expo-widgets` is young; `Link` inside widgets, file-path `Image`, and
  `ios.configuration` must be spiked first on a dev build before building the rest.
  If one fails, fallbacks *(my call)*: no per-game `Link` → whole medium widget
  opens Home on that section; no configuration → four widgets, one per section;
  no file-path images → stop and bring it back to the user before going further.
- expo-router resolution of `/game/<id>` with four matching routes.
