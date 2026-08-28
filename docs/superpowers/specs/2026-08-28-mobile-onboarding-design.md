# Mobile Onboarding — Design

**Date:** 2026-08-28
**Status:** Approved for planning
**Depends on:** `2026-08-27-barklog-mobile-design.md` §8 (authentication) and the
gate it describes in `src/auth/auth-gate.tsx`

## 1. Purpose

A first-time install opens straight onto Clerk's `AuthView`. Someone who has
never heard of Barklog is asked to sign in with Apple before anything has told
them what they would be signing into.

Four pages, ahead of the auth gate, explain the app to a stranger. They are
reachable without an account by construction, because they render before the
component that requires one.

### Goals

- Show before authentication, so a signed-out visitor sees them.
- Dismissable at any point, for the reinstalling user who already knows the app.
- Never shown twice to the same install, and never shown to a user whose session
  survived a reinstall in the keychain.
- The decision of whether to show them is a pure function, unit-testable in Node
  with no simulator, the way `should-clear-cache.ts` already is.

### Non-goals

Android. A settings toggle to replay onboarding. A server-side "has onboarded"
flag on the user record. Per-page analytics. Animated or illustrated artwork.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Placement | A gate component wrapping `AuthGate` | Routes live under `Slot`, which is inside `AuthGate`, so a route can never run first. |
| Persistence | `@react-native-async-storage/async-storage` | The SDK 57 documented key-value store. Lives in the app container, so a reinstall clears it, which is the case Skip exists for. `expo-secure-store` is keychain-backed and would silently outlive an uninstall. |
| Returning signed-in user | Auto-complete | If Clerk restores a session at launch, the user has an account and has seen the pitch. Skip the pages and write the flag. |
| Read failure | Resolves to "seen" | If storage is broken and the write fails too, a user who reads `false` every launch can never get past onboarding. Missing an optional flow beats being trapped in one. |
| Pager | `TabView` + `tabViewStyle({ type: "page" })` from `@expo/ui/swift-ui` | A real SwiftUI paged pager with dot indicators. No custom gesture handling and no dot state to track. |
| Page artwork | 52pt hierarchical SF Symbol | The recipe `components/empty-state.tsx` already uses. No assets, correct in both appearances. |
| Controls | Skip top-right; `Continue` / `Start` bottom | A visible primary action for users who do not think to swipe. Skip is hidden on the last page, where the primary button does the same thing. |

## 3. Placement and control flow

`OnboardingGate` wraps `AuthGate` in `src/app/_layout.tsx`:

```
ClerkProvider → QueryClientProvider → ApiProvider → ThemeProvider
  → OnboardingGate          ← new
      → AuthGate
          → Slot
```

### The splash screen has to move

`src/auth/auth-gate.tsx` currently calls `SplashScreen.preventAutoHideAsync()` at
module scope and hides the splash in an effect once Clerk reports `isLoaded`.

Put onboarding in front and `AuthGate` never mounts during it, so nothing hides
the splash and the pager renders underneath it, invisible.

Therefore:

- `preventAutoHideAsync()` moves to `src/app/_layout.tsx` module scope. That file
  is the entry point, so it runs before either gate decides anything.
- `OnboardingGate` calls `hideAsync()` in an effect when it renders the pager.
- `AuthGate` keeps its existing hide-on-`isLoaded` effect for the pass-through
  path, and loses only the module-scope `preventAutoHideAsync()` line.

`hideAsync()` is idempotent, so the second call when onboarding finishes and
`AuthGate` mounts is a no-op.

## 4. The decision

`src/onboarding/should-show-onboarding.ts` holds the whole policy:

```ts
export type OnboardingDecision = "pending" | "show" | "complete";

export function onboardingDecision(
  hasSeen: boolean | undefined,    // undefined = storage read in flight
  isSignedIn: boolean | undefined, // undefined = Clerk has not loaded
): OnboardingDecision;
```

| `hasSeen` | `isSignedIn` | Result | Reason |
|---|---|---|---|
| `undefined` | any | `pending` | Storage read in flight. Render nothing, splash held. |
| `true` | any | `complete` | Hot path. Does not wait on Clerk. |
| `false` | `undefined` | `pending` | The session has to be known first, or a reinstalling user gets a flash of onboarding before the auto-complete fires. |
| `false` | `true` | `complete` | Existing session. The gate also writes the flag, so the next launch takes the hot path. |
| `false` | `false` | `show` | Genuine first run. |

Waiting on `isSignedIn` costs nothing: `AuthGate` already blocks on the same
keychain read, so the splash is held for exactly as long as it is today.

`OnboardingGate` reads `isSignedIn` from `useAuth({ treatPendingAsSignedOut:
false })`, matching `AuthGate`, so a session mid-establishment is not read as
signed-out.

## 5. Storage

`src/onboarding/storage.ts`, key `barklog.onboarding.seen`, value `"1"`:

```ts
export async function readHasSeenOnboarding(): Promise<boolean>;
export async function markOnboardingSeen(): Promise<void>;
```

`readHasSeenOnboarding` catches and returns `true` on failure, per §2. `AsyncStorage`
returns `string | null`, so any non-null value counts as seen.

`markOnboardingSeen` swallows write failures. A user who dismissed onboarding and
then sees it again next launch is a small annoyance; an unhandled rejection that
blocks the transition into the app is not.

## 6. UI

`src/features/onboarding/onboarding-screen.tsx`:

```tsx
<Host style={styles.host} seedColor={Brand.tint}>
  <VStack>
    <HStack>                              {/* Skip, hidden on the last page */}
      <Spacer />
      <Button label="Skip" modifiers={[buttonStyle("plain")]} onPress={onComplete} />
    </HStack>

    <TabView
      selection={page}
      onSelectionChange={setPage}
      modifiers={[tabViewStyle({ type: "page", indexDisplayMode: "always" })]}
    >
      {/* one TabView.Tab per page */}
    </TabView>

    <Button
      label={isLast ? "Start" : "Continue"}
      modifiers={[buttonStyle(GLASS_PROMINENT_STYLE), controlSize("large")]}
      onPress={isLast ? onComplete : advance}
    />
  </VStack>
</Host>
```

`selection` is controlled, because the bottom button has to be able to advance the
pager and its label depends on which page is showing.

Each page body follows `components/empty-state.tsx`:

- `Image systemName` at `size={52}`, `foregroundStyle` hierarchical secondary,
  and `accessibilityHidden(true)`. The symbol restates the title, so VoiceOver
  reads the copy only.
- Title: `font({ textStyle: "title2", weight: "bold" })`.
- Description: `font({ textStyle: "body" })`, hierarchical secondary,
  `multilineTextAlignment("center")`, `frame({ maxWidth: 320 })`, and
  `fixedSize({ vertical: true })` so long copy wraps rather than truncating.

Page 4 adds, below the description:

```tsx
<Link destination={siteUrl()}>
  <Label title="igdb.com" systemImage="arrow.up.right.square" />
</Link>
```

SwiftUI `Link` opens the URL itself, so there is no `openURL` call to wire up.
No instructional sentence accompanies it.

### Safe area

`Host` respects the SwiftUI safe area by default, which is why it exposes
`ignoreSafeArea`. The gate renders outside expo-router's own `SafeAreaProvider`,
so this design relies on the SwiftUI insets rather than mounting a second
provider.

This is the one part that cannot be confirmed off-device. If the insets do not
apply, the fallback is a `SafeAreaProvider` at the root of `_layout.tsx` plus RN
padding from `useSafeAreaInsets` around the `Host`. Recorded as a risk in §10.

## 7. Copy

`src/features/onboarding/pages.ts`. Titles are the repo owner's wording and are
not to be re-edited.

| # | id | Symbol | Title | Description |
|---|---|---|---|---|
| 1 | `welcome` | `pawprint.fill` | Welcome to Barklog | Barklog holds the games you're playing and the ones you keep meaning to start. |
| 2 | `backlog` | `checklist` | Managing your game backlog | Add a game, then mark it waiting, playing, completed, or abandoned. Abandoned is a real answer. |
| 3 | `explore` | `sparkle.magnifyingglass` | Exploring games | See what's popular, what's coming out, and what just landed. Or search by name if you already know what you want. |
| 4 | `igdb` | `books.vertical.fill` | All game data is powered by IGDB | Every cover, release date, platform, and summary in Barklog comes from IGDB, a games database its community maintains. |

Page 2 names the four `BACKLOG_STATUSES` values from `@repo/contracts`. A test
asserts it still does, so renaming a status fails the suite rather than leaving
the onboarding describing an app that no longer exists.

Page 3's three items describe the three `SHELVES` feeds in
`src/features/explore/shelves.ts` (`popular`, `upcoming`, `recent`), in order,
but paraphrased ("what just landed", not "recent"). No test asserts that
correspondence, because any assertion strong enough to catch a drift would have
to match paraphrases, and one that loose would pass on anything.

`src/igdb-url.ts` gains `siteUrl()` beside `gameUrl()`, so the IGDB base URL
stays declared once.

## 8. Files

```
src/onboarding/onboarding-gate.tsx             new    gate: storage, Clerk, splash
src/onboarding/should-show-onboarding.ts       new    pure policy
src/onboarding/storage.ts                      new    AsyncStorage wrapper
src/features/onboarding/onboarding-screen.tsx  new    the pager
src/features/onboarding/pages.ts               new    the four pages
src/app/_layout.tsx                            edit   mount gate, own preventAutoHide
src/auth/auth-gate.tsx                         edit   drop module-scope preventAutoHide
src/igdb-url.ts                                edit   + siteUrl()
docs/mobile-device-verification.md             edit   + onboarding checks
```

Gate logic beside `src/auth/`, screen under `src/features/`, matching the split
the app already uses.

## 9. Testing

`vitest.config.mts` runs `test/**/*.test.ts` in plain Node with no react-native
transform, so anything under test must avoid react-native and `@expo/ui`
imports. `pages.ts` qualifies: its only import is the `SFSymbol` *type* from
`sf-symbols-typescript`.

| File | Covers |
|---|---|
| `test/onboarding-decision.test.ts` | Every row of §4's table, plus repeat renders in each state. |
| `test/onboarding-pages.test.ts` | Four pages; unique ids; every title and description non-empty; `igdb` is last; page 2's description contains every `BACKLOG_STATUSES` value. |
| `test/igdb-url.test.ts` | Extended with `siteUrl()`. |
| `test/onboarding-storage.test.ts` | The three read outcomes (missing, present, throws) and that a write failure resolves rather than rejects, mocking `@react-native-async-storage/async-storage` with a `vi.mock` factory so the real, react-native-requiring module is never loaded. |

The two components are not unit-tested: they are thin native wrappers whose
behaviour off-device is meaningless. They go on the device checklist instead.

## 10. Risks

| Risk | Mitigation |
|---|---|
| SwiftUI safe area does not apply inside `Host`, so Skip sits under the notch. | §6 fallback: root `SafeAreaProvider` plus `useSafeAreaInsets` padding. Device check. |
| `TabView` page style needs iOS 26 behaviour the repo has not exercised. | `tabViewStyle` is documented for all supported versions and is not glass-gated like `buttonStyle`. Device check ranks it high. |
| A new autolinked native module means `prebuild` and a fresh native build. | Called out as a task step, not an aside. |
| The splash move regresses "relaunching goes straight to the tabs" (device check 3). | The same effect still runs in `AuthGate`; only the `preventAutoHide` call relocates. Re-run device check 3. |

## 11. Deferred

An in-app replay of onboarding. To see it again during development, delete the
app from the simulator. If it turns out to be needed often, the cheapest version
is a dev-only `AsyncStorage.removeItem` behind `__DEV__`.
