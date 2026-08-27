# Barklog Mobile — Architecture Design

**Date:** 2026-08-27
**Status:** Approved for planning
**Delivers:** step 7 of `2026-08-25-barklog-api-design.md` §16 — "wire the mobile app"

## 1. Purpose

The API is finished: it serves the full surface of the API design's §8 against a
mirror of 373,715 games, behind Clerk-verified bearer tokens, with RFC 9457
problem documents throughout. The Expo app is four placeholder screens with no
auth, no data layer, and no tests.

This document describes turning it into the product: Clerk native
authentication guarding the whole app, a typed fetch layer over TanStack Query,
and four screens on real data.

### Goals

- Clerk native components (`AuthView`, `UserButton`, `UserProfileView`) as the
  entire identity surface — no hand-rolled sign-in UI.
- One place where wire shapes are declared, shared by API and app.
- A transport layer that is a plain function of its inputs, so its error
  handling is unit-testable without a simulator.
- Every screen on real endpoints. This is the step that finds out whether the
  API is actually right.

### Non-goals

Android, web, offline mutation queues, cache persistence across launches,
push notifications, and anything in §16 Deferred.

## 2. Decisions

| Decision             | Choice                                 | Why                                                                                                                                |
| -------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Identity UI          | Clerk native components                | Native SwiftUI sign-in, profile and avatar for the cost of three imports. `UserButton` opens `UserProfileView` itself — no wiring. |
| Auth guard           | Root-level, non-dismissible `AuthView` | The whole API is authenticated, so there is no anonymous state worth designing.                                                    |
| Data layer           | TanStack Query + plain `fetch`         | Chosen over Hono's `hc()` RPC client; see §6 for how types are preserved without it.                                               |
| Wire types           | Lifted into `@repo/contracts`          | One declaration. A drifting serializer breaks the API's own typecheck.                                                             |
| Lists and content    | React Native                           | `@expo/ui`'s SwiftUI `Image` cannot load a remote URL, and every list in this app is cover art.                                    |
| Controls             | `@expo/ui/swift-ui`                    | Real UIKit/SwiftUI controls: segmented pickers, glass buttons, native menus.                                                       |
| Colours              | `PlatformColor`                        | The RN half resolves the same iOS dynamic colours the SwiftUI half uses, in both appearances, with no branching.                   |
| Backlog ordering     | Client-side, pure function             | The collection arrives unpaginated in one response; the order is UI-specific.                                                      |
| Detail screen writes | Autosave on every change               | `PUT` is idempotent and total, which is what makes a Save button unnecessary.                                                      |
| Tests                | Vitest, pure layer only                | `@expo/ui` renders native views; asserting on them in jsdom tests the mock.                                                        |

## 3. UI composition rule

This rule governs every screen. It exists because one library constraint forces
the split, and drawing the line once is cheaper than re-litigating it per
component.

| Concern                                              | Built with                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Lists, rows, scroll containers, images, text content | React Native — `SectionList`, `FlatList`, `ScrollView`, `Pressable`, `expo-image` |
| Controls                                             | `@expo/ui/swift-ui` inside a `Host` — `Button`, `Menu`, `Picker`                  |
| Native state views                                   | `ContentUnavailableView`, `ProgressView`                                          |
| SF Symbols on the RN side                            | `expo-symbols` `SymbolView`                                                       |

**The forcing constraint.** `@expo/ui`'s `Image` accepts an SF Symbol name, an
asset-catalog name, or a _local_ file URI (`uiImage`, documented as a
synchronous main-thread read). It has no remote-URL prop. Every list in Barklog
is cover art from `images.igdb.com`, so a SwiftUI list would need an
`RNHostView` bridge view per visible row. React Native lists remove the bridge
entirely.

**`PlatformColor` is what stops the hybrid looking like two apps.** All RN
colour comes from `PlatformColor("label")`, `"secondaryLabel"`, `"separator"`,
`"systemBackground"`, `"secondarySystemGroupedBackground"`. These resolve to the
same iOS dynamic system colours the adjacent SwiftUI controls already use, in
light and dark, with no `useColorScheme` branch to keep in step. `src/theme.ts`
keeps only `Brand.tint` — fed to `Host seedColor`, which propagates through the
SwiftUI environment — plus the shared type scale.

**Control islands** embed with `<Host matchContents={{ vertical: true }}>`, which
sizes the host view to its SwiftUI content so a button row measures correctly
inside an RN `ScrollView`.

**iOS 26 guard.** `buttonStyle('glass')` and `'glassProminent'` are iOS 26+.
`src/ui/glass.ts` exports a `glassOr()` helper that reads `Platform.Version` and
falls back to `'bordered'` / `'borderedProminent'`. Without it the buttons
render style-less on iOS 18 rather than merely plainer. Pure function,
unit-tested.

## 4. Dependencies and native configuration

### Packages

| Package                 | Purpose                                               |
| ----------------------- | ----------------------------------------------------- |
| `@clerk/expo`           | `ClerkProvider`, `useAuth`, and `./native` components |
| `expo-secure-store`     | Backing store for `tokenCache`                        |
| `@tanstack/react-query` | Query cache, mutations, invalidation                  |
| `expo-image`            | Remote covers and screenshots, with a disk cache      |
| `expo-linear-gradient`  | Hero backdrop fade (§11.4)                            |
| `vitest` (dev)          | §13                                                   |

Installed with `npx expo install` so SDK 57-compatible versions are resolved.

**Nothing else is needed for Apple Sign In.** `@clerk/expo` declares
`expo-apple-authentication`, `expo-crypto`, `expo-web-browser` and
`expo-auth-session` as peers, but all are marked optional and all are for
hand-rolled sign-in UIs. `<AuthView />` runs the Apple flow internally. Adding
them speculatively would put four unused native modules in the build.

`RNHostView` is used nowhere. `react-native-gesture-handler` and
`react-native-reanimated` stay as they are.

### `app.json`

```json
"plugins": [
  "expo-router",
  ["expo-splash-screen", { "backgroundColor": "#208AEF", "image": "./assets/images/splash-icon.png", "imageWidth": 76 }],
  "expo-secure-store",
  "@clerk/expo"
]
```

`@clerk/expo` takes no options: `appleSignIn` defaults to `true`, which is what
we want, and it adds the `com.apple.developer.applesignin` entitlement.

This is a config-plugin change, so it needs
`pnpm --filter mobile prebuild && pnpm --filter mobile ios`. A JS reload will
not pick it up, and Expo Go cannot run it at all — the app already uses
`expo-dev-client`.

### Blocking prerequisites

The entitlement makes code signing fail unless the App ID carries the matching
capability, so these come before the first native build:

1. Apple Developer portal → App ID `gg.barklog.app` → enable **Sign In with
   Apple**.
2. Clerk Dashboard → **Native Applications** → add the iOS app (Apple Team ID +
   bundle id `gg.barklog.app`).
3. Clerk Dashboard → **SSO connections** → enable Apple.

## 5. Environment

| File                                             | Adds                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `apps/mobile/.env.example`                       | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=`                                      |
| `apps/mobile/.env` (gitignored, created by hand) | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`                |
| `turbo.json`                                     | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in the `build` and `dev` `env` arrays |

The publishable key is the same value already in `apps/api/.env` as
`CLERK_PUBLISHABLE_KEY`. Same Clerk instance on both sides is precisely what
makes the API's JWKS verification accept the app's tokens; a mismatch surfaces
as a uniform 401 on every request with nothing in the app to explain it.

The turbo entry is not optional — `turbo/no-undeclared-env-vars` flags any
variable missing from the relevant task (API design §14).

On a physical device `EXPO_PUBLIC_API_URL` must be the host's LAN IP. iOS App
Transport Security blocks plain HTTP; if `expo prebuild` does not already emit a
local-networking exception, `ios.infoPlist.NSAppTransportSecurity` gets an
explicit development-only one.

## 6. Shared wire contract

New `packages/contracts/src/wire.ts` — interfaces only, no valibot, no runtime
code, exported from `src/index.ts`.

```ts
export interface NamedRef {
  id: number;
  name: string;
  slug: string;
}
export interface PlatformRef extends NamedRef {
  abbreviation: string | null;
}

export interface GameSummaryWire {
  id: number;
  name: string;
  slug: string;
  coverImageId: string | null;
  firstReleaseDate: string | null;
  totalRating: number | null;
  totalRatingCount: number;
}

export interface GameDetailWire extends GameSummaryWire {
  summary: string | null;
  gameType: { id: number; name: string } | null;
  parentGame: { id: number; name: string } | null;
  screenshots: string[];
  genres: NamedRef[];
  platforms: PlatformRef[];
  developers: NamedRef[];
  publishers: NamedRef[];
}

export interface BacklogEntryWire {
  gameId: number;
  status: BacklogStatus;
  rating: number | null;
  addedAt: string;
  updatedAt: string;
}

export interface BacklogListItemWire extends BacklogEntryWire {
  game: GameSummaryWire;
}

export interface GameListResponse {
  items: GameSummaryWire[];
}
export interface GameDetailResponse extends GameDetailWire {
  backlogEntry: BacklogEntryWire | null;
}
export interface BacklogListResponse {
  items: BacklogListItemWire[];
}
export interface BacklogStatsWire {
  total: number;
  counts: Record<BacklogStatus, number>;
  averageRating: number | null;
}
export interface ProblemDocument {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  errors?: { field: string; message: string }[];
}
```

`apps/api/src/serialize.ts` deletes its four interface declarations and
re-exports the contracts ones, so every existing importer in `apps/api`
compiles unchanged while the API's own typecheck now fails if a serializer
drifts from the shared contract.

Three things this records that were previously unwritten:

**The response envelopes did not exist anywhere.** `apps/api` builds
`{ items }` and `{ ...detail, backlogEntry }` inline in its route handlers.
`GameDetailResponse` is the first time the shape the mobile app actually
receives is named.

**`NamedRef` and `PlatformRef` are declared here, not imported from
`@repo/db`.** `packages/contracts` must stay free of Node dependencies so the
mobile bundle does not pull one in (API design §3). `@repo/db` keeps its own
identical declarations as row-shape types; structural typing reconciles them at
the serializer.

**`ProblemDocument` matches the code, not §11 of the API design.** Per that
document's own §16 reconciliation, validation errors are `{field, message}`
with a dot-joined path — not `{pointer, detail}` — and a 422 carries
`type: "about:blank"` with no `instance` or `traceId` in the body, the
correlation id travelling in the `X-Request-Id` header instead.

## 7. Route tree

```
app/_layout.tsx                    ClerkProvider → QueryClientProvider → ThemeProvider → AuthGate → Stack
app/(tabs)/_layout.tsx             NativeTabs: (home) | explore | search
app/(tabs)/(home)/_layout.tsx      Stack
app/(tabs)/(home)/index.tsx        → BacklogScreen
app/(tabs)/(home)/game/[id].tsx    → GameDetailScreen
app/(tabs)/explore/_layout.tsx     Stack
app/(tabs)/explore/index.tsx       → ExploreScreen
app/(tabs)/explore/game/[id].tsx   → GameDetailScreen
app/(tabs)/search/_layout.tsx      Stack
app/(tabs)/search/index.tsx        → SearchScreen
app/(tabs)/search/game/[id].tsx    → GameDetailScreen
```

Deleted: `(tabs)/profile.tsx`, `(tabs)/index.tsx`, `(tabs)/explore.tsx`.

Tabs are Home, Explore, Search. Search keeps its `role="search"` trigger, which
iOS 26 renders apart from the group and morphs into the native search field.

**Home is the route group `(home)`, not a directory named `index`.** A group
adds no path segment, so `(tabs)/(home)/index.tsx` still resolves to `/` while
being able to carry its own `_layout.tsx` stack. A directory literally named
`index` would depend on segment-normalisation behaviour that is not specified.

**The three `game/[id].tsx` files are 3-line re-exports** of one
`src/features/game/game-detail-screen.tsx`. The triplication is what keeps the
push inside its tab, so the native tab bar stays visible and each tab keeps its
own back history — how Apple Music, Settings and the App Store all behave. A
single root-level route would push over the tab bar and share one history
across all three tabs.

`experiments.typedRoutes` is on, so `.expo/types` must be regenerated after the
route files move; a stale cache presents as phantom typecheck errors.

## 8. Authentication

`app/_layout.tsx`:

```tsx
<ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
  <QueryClientProvider client={queryClient}>
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AuthGate>
      <StatusBar style="auto" />
    </ThemeProvider>
  </QueryClientProvider>
</ClerkProvider>
```

A missing `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` throws at module scope, matching
how `apps/api` refuses to boot on a missing secret rather than failing on the
first request that needs it.

`src/auth/auth-gate.tsx` reads
`useAuth({ treatPendingAsSignedOut: false })` and renders one of three things
as siblings at the same level:

| State         | Renders                                   |
| ------------- | ----------------------------------------- |
| `!isLoaded`   | Splash held open via `expo-splash-screen` |
| `!isSignedIn` | `<AuthView isDismissible={false} />`      |
| signed in     | `children`                                |

`treatPendingAsSignedOut: false` is Clerk's documented flag for not misreading a
session mid-establishment as signed-out. Rendering the three cases as siblings
is Clerk's documented arrangement for keeping `AuthView` from unmounting while
sign-in completes.

Holding the splash rather than rendering a spinner means a returning user with a
cached token never sees a flash of the auth screen.

`isDismissible={false}` is what makes this a guard rather than a modal: there is
no anonymous state in this app, because there is no unauthenticated endpoint
except the two probes.

**Sign-out clears the query cache.** The decision is a pure function —
`shouldClearCache(previous, next)`, true only on the `true → false` transition —
which an effect watching `isSignedIn` uses to call `queryClient.clear()`.
Extracting it is what makes the behaviour testable without a renderer (§13);
inlining the comparison in the effect would leave the one auth path with a
user-visible failure mode unverified. Without it the next person
to sign in on that device sees the previous user's backlog rendered from cache
before the first refetch lands. This is the one piece of auth wiring with a
real, user-visible failure mode, and it gets its own test.

Sign-out itself lives inside Clerk's `UserProfileView`, which manages active
sessions. If it proves not to be exposed there, the fallback is a
`Stack.Toolbar.Menu` action — to be verified on device rather than built
speculatively.

## 9. Transport layer

`src/api/client.ts`

```ts
export function createApiClient(deps: {
  baseUrl: string;
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
}): ApiClient;
```

No React. That is the whole reason this layer is testable without a simulator,
and it is the layer most likely to be wrong.

Every request carries `Authorization: Bearer <token>` and
`Accept: application/json`; `Content-Type: application/json` only when there is
a body.

### Errors

`src/api/errors.ts`

```ts
export class ApiError extends Error {
  status: number;
  type: string;
  title: string;
  detail?: string;
  traceId?: string;
  errors?: { field: string; message: string }[];
  retryAfter?: number;
}
```

Any non-2xx is read as `application/problem+json`. A response that is _not_ a
problem document — a proxy 502, say — falls back to a synthesised `ApiError`
from the status alone, so the app never surfaces a JSON parse failure where an
HTTP error happened. A 429 additionally carries `retryAfter` from the header.

A 5xx never has a `detail`, by the API's design (§11 of the API design), so
error copy for 5xx cannot rely on one.

### 401 gets exactly one retry

Retried once with `getToken({ skipCache: true })`, then thrown. Clerk refreshes
proactively, so a 401 in practice means a revoked session; retrying past that
is a loop.

### 304 is handled defensively, not eagerly

`GET /api/backlog` is ETag'd with `Cache-Control: private, no-cache`. On iOS,
`NSURLSession` performs the `If-None-Match` revalidation itself and hands
JavaScript a transparent `200` with the stored body — a bare 304 normally never
reaches this code. If one does, the client refetches once with
`cache: "reload"` rather than parsing an empty body.

The obvious alternative — threading TanStack's previous value into the query
function and returning it on 304 — is rejected deliberately: it would
reimplement, in JavaScript, revalidation the URL loading system already does
correctly, and it would couple the transport layer to the cache.

### Endpoints and keys

`src/api/endpoints.ts` — one function per route, each returning a contracts
envelope type:

| Function                                         | Request                       |
| ------------------------------------------------ | ----------------------------- |
| `searchGames({ q, limit, offset })`              | `GET /api/games/search`       |
| `popularGames({ limit })`                        | `GET /api/games/popular`      |
| `getGame(id)`                                    | `GET /api/games/:id`          |
| `listBacklog({ status?, sort? })`                | `GET /api/backlog`            |
| `getBacklogStats()`                              | `GET /api/backlog/stats`      |
| `upsertBacklogEntry(gameId, { status, rating })` | `PUT /api/backlog/:gameId`    |
| `deleteBacklogEntry(gameId)`                     | `DELETE /api/backlog/:gameId` |

`src/api/keys.ts` — a key factory, so no cache key is spelled twice.

## 10. Data layer

`src/api/hooks.ts` exposes `useSearchGames`, `usePopularGames`, `useGame`,
`useBacklog`, `useBacklogStats`, `useUpsertBacklogEntry`,
`useDeleteBacklogEntry`. The client instance comes from a small context built
once from Clerk's `getToken`.

`QueryClient` defaults:

| Option      | Value                                           | Reason                                                  |
| ----------- | ----------------------------------------------- | ------------------------------------------------------- |
| `staleTime` | 60 s                                            | Also what keeps repeated search queries off the network |
| `retry`     | `false` for any 4xx `ApiError`, else 2 attempts | A 404 or 422 will never succeed on retry                |

Mutations optimistically patch `keys.games.detail(id)` and invalidate
`keys.backlog.*` on settle. Nothing is persisted across launches.

## 11. Screens

### 11.0 Header

Each tab root declares its own header inline:

```tsx
<Stack.Title large>Home</Stack.Title>
<Stack.Toolbar placement="right">
  <Stack.Toolbar.View>
    <UserButton />
  </Stack.Toolbar.View>
</Stack.Toolbar>
```

`Stack.Toolbar.View` is the slot that accepts an arbitrary React component, and
it must be nested inside a `Stack.Toolbar` carrying the `placement`.
`StackToolbarViewProps` carries neither `asChild` nor `placement` — `asChild` is
a prop of `Stack.Toolbar` itself, and is unnecessary here.
`Stack.Toolbar.Button` takes only an SF Symbol and so cannot host `UserButton`.
`placement="right"` also forces `headerShown: true`, which is what brings the
large title with it.

`UserButton` opens `UserProfileView` natively on tap. There is no `onPress`, no
modal state and no route — the requirement is satisfied by the component.

Shared as `src/components/profile-toolbar.tsx` so the three tab roots do not
repeat it. Pushed screens do not render it: they get a back button and an inline
title, as every Apple app does.

### 11.1 Home — `BacklogScreen`

Large title "Home", `house` / `house.fill`.

A `Host` above the list holds a segmented `Picker`
(`pickerStyle('segmented')`): All, Waiting, Playing, Completed, Abandoned. The
`/api/backlog/stats` total and average rating render as RN text beneath it.

Below, a `SectionList` of `GameRow` with a `RefreshControl`.

#### Ordering

With **All** selected the request is `GET /api/backlog?sort=updated_at` with no
`status` parameter, and the client groups.

`src/features/backlog/sections.ts`:

```ts
const STATUS_ORDER = ["playing", "waiting", "completed", "abandoned"] as const;
toSections(items, filter): { status, title: string | null, count, data }[]
```

Empty groups are omitted. Secondary order inside a group is whatever the API
returned — `updated_at DESC` — so the most recently touched game is at the top
of each section.

A specific status filter returns **one section with `title: null`**, and
`renderSectionHeader` renders nothing for a null title. `SectionList` is
therefore the single code path for both cases rather than a branch between two
list components.

Two decisions worth recording:

**`STATUS_ORDER` is a mobile presentation constant and is deliberately not added
to `@repo/contracts`.** `BACKLOG_STATUSES` there is the declaration order of the
Postgres enum, and `packages/db`'s status-parity test depends on it. Reordering
that constant to suit this screen would break the database contract — the
tempting one-line change is the wrong one.

**Client-side, not a new `sort=status` on the API.** The whole collection
arrives unpaginated in one response (API design §8), so the sort costs nothing;
the order is UI-specific rather than general; and it stays a pure function with
real unit tests instead of new SQL.

#### Empty states

Two, because they mean different things.

**No entries at all** — All selected and `total === 0`. One `Host`, one
`VStack`:

```
ContentUnavailableView   "Your backlog is empty" · gamecontroller
                         "Add the games you own and Barklog will keep track of
                          what you're playing, what's up next, and what you've
                          finally finished."
Button                   "Find a game"  (glassProminent) → router.navigate("/search")
```

`ContentUnavailableView` takes only `title`, `systemImage` and `description` —
no children and no action slot — so the button is a **sibling in the `VStack`**,
not a child.

The segmented filter and the stats line are **hidden** in this state. A filter
over nothing is noise.

**A filter with no entries** — a specific status selected with zero matches.
Lighter, no call to action, and the filter stays visible so the user can get
back out.

| Status      | Symbol           |
| ----------- | ---------------- |
| `waiting`   | `clock`          |
| `playing`   | `gamecontroller` |
| `completed` | `checkmark.seal` |
| `abandoned` | `xmark.bin`      |

Copy table in `src/features/backlog/empty-states.ts`, pure. Its test is keyed
off `BACKLOG_STATUSES`, so adding a fifth status to the enum fails the test
rather than shipping a blank screen.

### 11.2 Explore — `ExploreScreen`

Large title "Explore", `safari` / `safari.fill`.
`GET /api/games/popular?limit=50`, a `FlatList` of the same `GameRow`.

### 11.3 Search — `SearchScreen`

Large title "Search", `role="search"` trigger.

`Stack.SearchBar` drives a **400 ms debounce** with a **two-character minimum**,
which is the API's own floor. Its `onChangeText` receives a native event, so the
text is read as `event.nativeEvent.text` — not as a plain string argument. `placeholderData: keepPreviousData` stops results
blanking between keystrokes.

Under two characters shows a prompt state; zero results show a
`ContentUnavailableView`.

The 400 ms debounce plus the 60 s `staleTime` — which makes a repeated query
free — is what keeps type-ahead under the API's 30 requests/minute search limit.
See §15.

### 11.4 Game detail — `GameDetailScreen`

```
   ┌─ blurred cover, scaled to fill, blurRadius ─┐
   │  LinearGradient → systemBackground          │   RN, absolutely positioned
   │                                             │
   │  ┌────────┐  Elden Ring                     │   RN hero
   │  │        │  FromSoftware                   │
   │  │ cover  │  2022 · Action RPG              │
   │  │  3:4   │  ★ 96 · 12,481 ratings          │
   │  └────────┘                                 │
   └─────────────────────────────────────────────┘
        ╭────╮  ╭──────────────╮  ╭────╮             ONE Host, HStack of 3
        │ ★8 │  │  ▶ Playing   │  │  ⋯ │
        ╰────╯  ╰──────────────╯  ╰────╯

     Along with its punishing difficulty, Elden      RN Text, numberOfLines 3
     Ring's open world…                    MORE

     ▓▓▓▓▓▓  ▓▓▓▓▓▓  ▓▓▓▓▓▓                         RN horizontal FlatList

     Released      22 February 2022                 RN grouped rows
     Genres        Action, RPG
     Platforms     PS5, Xbox Series X|S, PC
     Developers    FromSoftware
     Publishers    Bandai Namco
```

Cover left, information right, actions below — chosen over Apple Music's centred
arrangement because game covers are 3:4 portrait rather than square, so a
side-by-side hero wastes no vertical space.

**Header** is `<Stack.Header transparent />` so the backdrop runs under the nav
bar, with the game name as an inline `Stack.Title`. Only the back button lives
there; the `⋯` is in the hero trio, and a second one in the nav bar would be two
menus doing one job.

**Backdrop.** The cover rendered again behind the hero at `blurRadius`, scaled
to fill, with an `expo-linear-gradient` fading it into `systemBackground`.
Because it derives from the artwork, every game screen looks different — the
property that makes the reference design feel alive.

A pale cover would wash out the title, so the gradient is a two-stop scrim: a
translucent `systemBackground` layer over the blur _before_ the fade. A missing
`coverImageId` falls back to a flat `systemBackground` with no blur layer at
all. This is the part of the screen expected to need iteration in the simulator,
verified against a pale cover, a dark cover and a missing cover.

**The action trio** — one `Host`, one `HStack`:

| Control | Style                                                             | Behaviour                                                                                                                 |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Rating  | circular `glass`, label `★ 8` or `★`                              | `Menu` containing an inline `Picker`: No rating, 1–10. `disabled` until an entry exists, because `PUT` requires a status. |
| Status  | capsule `glassProminent`, label `▶ Playing` or `+ Add to Backlog` | `Menu` containing a `Picker` of the four statuses. Picking one when untracked _is_ the add.                               |
| More    | circular `glass`, `ellipsis`                                      | One destructive `Button`, "Remove from Backlog". Hidden when untracked.                                                   |

Every change fires `PUT` (or `DELETE`) immediately, optimistically patching
`keys.games.detail(id)` and invalidating `keys.backlog.*`. No Save button: an
entry is two fields and the client always holds both, so a full idempotent
replace is always expressible — the same reasoning that made `PUT` the only
write verb on the API.

**The summary** is an RN `Text` with `numberOfLines={3}` and a trailing "MORE"
`Pressable` that clears the limit. It stays RN rather than becoming a SwiftUI
`DisclosureGroup` because it is body content, not a control (§3).

`src/features/game/format.ts` holds the pure label builders — the
`2022 · Action RPG` meta line, `★ 96 · 12,481 ratings`, and the status and
rating button labels.

## 12. Shared components

| Module                               | Purpose                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/profile-toolbar.tsx` | `Stack.Toolbar.View` + `UserButton`                                                                                                                               |
| `src/components/game-row.tsx`        | RN row: cover 44×59, name, subtitle, `SymbolView` chevron, hairline separator, `Pressable`                                                                        |
| `src/components/query-boundary.tsx`  | Pending → `ProgressView`; error → `ContentUnavailableView` + retry `Button`, copy keyed off `ApiError.status`                                                     |
| `src/components/cover.tsx`           | `expo-image` with size variants and a symbol placeholder                                                                                                          |
| `src/igdb-image.ts`                  | `https://images.igdb.com/igdb/image/upload/t_{size}/{imageId}.jpg` — `t_cover_small` rows, `t_cover_big` hero, `t_screenshot_med` screenshots; `null` id → `null` |
| `src/ui/glass.ts`                    | `glassOr()` iOS-26 button-style fallback                                                                                                                          |
| `src/query-client.ts`                | `QueryClient` with the §10 defaults                                                                                                                               |

`src/components/placeholder-screen.tsx` is **deleted**. Every screen now has a
real empty, loading and error state, and `query-boundary.tsx` plus the two
backlog empty states cover everything it was standing in for.

Error copy is keyed off status: 429 gets "Too many searches — give it a moment";
5xx gets generic text, since a 5xx problem carries no `detail`.

## 13. Testing

Vitest in `apps/mobile`, written test-first, on the pure layer only.

No component rendering. `@expo/ui` components are native views that render to
nothing meaningful in jsdom, so assertions there would test the mock rather than
the app.

| File                   | Covers                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.test.ts`       | URL and query-string construction per endpoint; Bearer header from a stub `getToken`; `Content-Type` present on `PUT` and absent on `GET`/`DELETE`; problem+json → `ApiError` field for field; non-problem error body fallback; `204` → `undefined`; `304` → one `cache: "reload"` refetch; `401` → exactly one `skipCache` retry then throw; `429` → `retryAfter`; network rejection wrapped |
| `keys.test.ts`         | Key structure and stability; different filters yield different keys                                                                                                                                                                                                                                                                                                                           |
| `sections.test.ts`     | Order is Playing → Waiting → Completed → Abandoned regardless of input order; empty groups omitted; counts correct; a filtered call yields one headerless section; empty input yields zero sections                                                                                                                                                                                           |
| `empty-states.test.ts` | A copy entry exists for every member of `BACKLOG_STATUSES`                                                                                                                                                                                                                                                                                                                                    |
| `format.test.ts`       | Meta line with and without year, genre, rating; status and rating button labels; untracked labels                                                                                                                                                                                                                                                                                             |
| `igdb-image.test.ts`   | Each size variant; `null` → `null`                                                                                                                                                                                                                                                                                                                                                            |
| `glass.test.ts`        | iOS 26 → glass styles; iOS 18 → bordered fallbacks                                                                                                                                                                                                                                                                                                                                            |
| `auth-gate.test.ts`    | `shouldClearCache(previous, next)` — true only on the `true → false` transition, false on first load (`undefined → false`), on sign-in, and on repeat renders                                                                                                                                                                                                                                 |

`apps/mobile` gains a `test` script, which `turbo run test` picks up
automatically. Test files import from `vitest` explicitly rather than relying on
globals, so the existing `expoAppConfig` ESLint config needs no changes.

## 14. Build order

Each step ends somewhere you can stop.

0. **Prerequisites** — the three Apple/Clerk dashboard steps in §4.
1. `packages/contracts` wire types; `apps/api/src/serialize.ts` re-exports them.
   Whole repo still typechecks and all 206 tests still pass.
2. Mobile dependencies, `app.json` plugins, env, turbo entries, vitest setup.
   `prebuild` + `run:ios` succeeds and the app still shows placeholders.
3. Clerk: `ClerkProvider`, `AuthGate`, `AuthView`. Sign in with Apple works;
   placeholders are behind the guard.
4. Transport layer and query client, test-first. No screen uses them yet.
5. Navigation: tabs restructured, profile tab deleted, per-tab stacks, large
   titles, `UserButton` in every tab-root header. The three `game/[id].tsx`
   route files are created here rendering only a title, so the row taps added
   in step 6 have somewhere to land.
6. Home on real data: stats, segmented filter, sections, both empty states.
7. Explore and Search.
8. Game detail: hero, backdrop, action trio, mutations, detail sections.

Step 1 lands before anything mobile so the app is never written against types
that are about to move. Step 3 precedes step 4 because the transport layer needs
a real token to be exercised at all.

## 15. Risks

| Risk                                             | Mitigation                                                                                                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN ↔ SwiftUI visual seam                         | `PlatformColor` throughout and a shared type scale; the action trio on its RN background is the first thing to check in the simulator                                                         |
| Backdrop legibility across 370k covers           | Two-stop scrim; verified against pale, dark and missing covers                                                                                                                                |
| iOS < 26 renders style-less buttons              | `glassOr()` fallback to `bordered` / `borderedProminent`; the screen is materially plainer there                                                                                              |
| Search type-ahead exceeds 30 req/min             | 400 ms debounce plus 60 s `staleTime` makes repeats free; 429 handled with specific copy. If it bites, raise the limit in `apps/api/src/rate-limits.ts` rather than fighting it on the client |
| Plain-HTTP API URL blocked on device             | `ios.infoPlist.NSAppTransportSecurity` development-only exception if `prebuild` does not already emit one                                                                                     |
| Stale `.expo/types` after routes move            | Regenerate; presents as phantom typecheck errors                                                                                                                                              |
| Apple entitlement without the App ID capability  | §4 prerequisites are step 0 of the build order                                                                                                                                                |
| Sign-out may not be exposed in `UserProfileView` | Verify on device; fallback is a `Stack.Toolbar.Menu` action                                                                                                                                   |

## 16. Deferred

- **Swipe-to-delete on the backlog list.** `SectionList` has no equivalent of
  SwiftUI's `List.ForEach onDelete`, and `ReanimatedSwipeable` is real work for
  an infrequent action the detail screen's `⋯` menu already covers.
- **Full-screen screenshot viewer.**
- **Cache persistence across launches** and an offline mutation queue.
- **Android and web.** `@clerk/expo` supports both, and the native components
  have Jetpack Compose and `@clerk/expo/web` counterparts, but every layout
  decision here is iOS-shaped.
