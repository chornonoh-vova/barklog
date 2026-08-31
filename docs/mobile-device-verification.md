# Device verification checklist

Every step below was specified in the plan but could not run during the
subagent-driven build, because all of them need a native build and that needs
Apple Developer + Clerk Dashboard configuration only the repo owner can do.
Ordered by risk: the first three would each make the app unusable, so check them
before anything cosmetic.

## Prerequisites

1. Apple Developer portal -> Identifiers -> App ID `gg.barklog.app` -> enable
   **Sign In with Apple**. Without this, code signing fails outright, because the
   `@clerk/expo` config plugin adds the `com.apple.developer.applesignin`
   entitlement.
2. Clerk Dashboard -> **Native Applications** -> add the iOS app (Apple Team ID +
   bundle id `gg.barklog.app`).
3. Clerk Dashboard -> **SSO connections** -> enable **Apple**.
4. Create `apps/mobile/.env` with `EXPO_PUBLIC_API_URL` and
   `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. The key must be the SAME Clerk instance
   as the API's `CLERK_SECRET_KEY`, or every request is a 401 with nothing in the
   app to explain it. On a physical device use the host's LAN IP, not localhost.
5. Apple Developer portal -> Identifiers -> create an App ID for
   `gg.barklog.app.ShareExtension`, create the App Group
   `group.gg.barklog.app`, and enable the App Group capability on **both**
   `gg.barklog.app` and the extension App ID. Needed by the `expo-sharing`
   plugin's generated share extension; without it the build will not install.

Then:

```bash
pnpm deps:up                      # Postgres + Valkey
pnpm --filter api dev             # API on :3000
pnpm --filter mobile prebuild     # required — config plugins changed, and AsyncStorage
                                   # is a new autolinked native module; skipping this
                                   # produces a launch crash that looks nothing like a
                                   # missing dependency
pnpm --filter mobile ios
```

## Blocking checks

- [ ] **1. Sign-in completes and does not hang on the auth screen.**
      HIGHEST RISK. `AuthGate` renders on `isAuthFlowComplete` from Clerk's
      `useAuthViewState()` rather than on `isSignedIn`, so that a native
      biometric-enrollment prompt is not cut off mid-flow. If the native module
      ever reported `isAuthFlowComplete: false` persistently, sign-in would
      appear to hang forever on the auth screen. If that happens, the revert is
      two lines in `src/auth/auth-gate.tsx`: render on `isSignedIn` from the
      `useAuth` call already in that file.
- [ ] **2. Sign in with Apple appears as an option** and completes. If Apple is
      absent from the options, prerequisites 2-3 are incomplete.
- [ ] **3. Relaunching goes straight to the tabs** with no flash of the sign-in
      screen — the splash is held until Clerk has read the keychain.
- [ ] **4. Requests are authorised.** Any populated screen proves the Bearer
      token reaches the API. A uniform 401 everywhere means the publishable key
      and the API's secret key are from different Clerk instances.
- [ ] **5. The Home tab renders at all** — confirms the `(home)` route group
      resolves to `/` and works as a `NativeTabs.Trigger` name. Statically
      verified (`stripGroupSegmentsFromPath` strips group segments; trigger names
      match route-node names, as the root layout's `name="(tabs)"` already
      relies on) but never run.

## Interaction checks

- [ ] **6. Three tabs only** — Home, Explore, Search. No Profile tab.
- [ ] **7. The avatar appears top-right on all three tab roots** and tapping it
      opens Clerk's native `UserProfileView`.
- [ ] **8. Sign-out exists inside `UserProfileView`.** If it does not, add a
      `Stack.Toolbar.Menu` sign-out action — this was flagged as unverified from
      the start.
- [ ] **9. Signing out and back in as a different user shows the second user's
      backlog, not the first's.** This is what `shouldClearCache` guards; it is
      unit-tested but its wiring into the effect is not.
- [ ] **10. The Search tab shows the native search field** (iOS 26 morphs the
      `role="search"` trigger) and typing returns results.
- [ ] **11. Tapping a row pushes the detail screen INSIDE the tab**, with the
      tab bar still visible and a back button in the header. This is the whole
      reason for the three duplicated `game/[id].tsx` routes.
- [ ] **12. A failed pull-to-refresh does not blank the screen.** Kill the API
      mid-session and pull to refresh: the stale list must stay. This is the
      `QueryBoundary` data-before-error ordering.

## Visual checks

- [ ] **13. The RN/SwiftUI seam is invisible.** The clearest test is the game
      detail screen, where a SwiftUI `Host` of glass buttons sits directly on an
      RN background. `PlatformColor` should make them agree in both light and
      dark — check both.
- [ ] **14. Hero backdrop legibility across covers.** Check a pale cover, a dark
      cover, and a game with no cover (which must show a flat background, not a
      grey smear). This is the part expected to need iteration.
- [ ] **15. iOS below 26** renders buttons as bordered capsules rather than
      unstyled — the `glassOr` fallback.
- [ ] **16. Search type-ahead does not hit the rate limit.** Type continuously
      for 30s; the 429 state should not appear. If it does, raise the `search`
      limit in `apps/api/src/rate-limits.ts` rather than shortening the 400ms
      debounce.
- [ ] **17. The app can reach the API over plain HTTP on a physical device.**
      `expo prebuild` emits `NSAllowsArbitraryLoads: false` with
      `NSAllowsLocalNetworking: true`. Whether that covers a bare private-range
      LAN IP such as `http://192.168.1.5:3000` is unverified. If requests fail
      with a uniform "You're offline", add a development-only
      `ios.infoPlist.NSAppTransportSecurity` exception in `app.json` and
      rebuild. An ATS exception is deliberately NOT pre-applied: loosening
      transport security should be a deliberate response to an observed
      failure, not a precaution.
- [ ] **18. The Explore shelves scroll and stay aligned.** Check the two rows
      stay aligned across very different title lengths (the fixed heights in
      `game-tile.tsx` are all that holds it), and that the horizontal lists do
      not fight the vertical `ScrollView` for the gesture.

## Onboarding checks

Added by `docs/superpowers/plans/2026-08-28-mobile-onboarding.md`. Check 19
first: it is the one that can regress behaviour that already worked.

- [ ] **19. A returning signed-in user still goes straight to the tabs.** This is
      check 3 again, re-run because the splash lifecycle moved out of
      `src/auth/auth-gate.tsx` into `src/splash.ts`, which both gates now drive
      through `useReleaseSplash`. No onboarding, no flash of the sign-in screen,
      and above all no splash that never goes away. A stuck splash means no gate
      ever reported itself ready; a splash that lifts too early means one
      reported ready before it had anything to paint.
- [ ] **20. A fresh install shows onboarding before the sign-in screen.** Sign
      out first (or Erase All Content and Settings), then delete the app.
      Deleting the app alone does not clear the simulator's keychain — Clerk's
      session lives there (`@clerk/expo` uses `expo-secure-store` with
      `AFTER_FIRST_UNLOCK`), and keychain items survive an app deletion. A
      tester still signed in from checks 1-18 who deletes the app without
      signing out first will correctly see NO onboarding (the reinstall
      auto-complete branch), which is working as designed, not a failure. Four
      pages, swipeable, dots at the bottom.
- [ ] **21. The controls sit inside the safe area.** HIGHEST RISK of the
      cosmetic checks. `Host` is trusted to propagate the SwiftUI safe area, and
      the gate renders outside expo-router's `SafeAreaProvider`, so this is
      untested. If Skip is under the notch or the button under the home
      indicator, add a `SafeAreaProvider` at the root of `_layout.tsx` and pad
      the `Host` with `useSafeAreaInsets`. Check on a notched device.
- [ ] **22. Skip works, and stays worked.** Tap Skip on page 1, land on the
      sign-in screen with no white or blank flash in between the last
      onboarding page and it, force-quit, relaunch: no onboarding. Then the
      same for swiping to page 4 and tapping Start.
- [ ] **23. The igdb.com link opens the site**, and page 4 shows the
      external-link glyph beside it.
- [ ] **24. Onboarding renders in both appearances.** Symbols and secondary text
      come from SwiftUI hierarchical styles, so light and dark should both work
      without a `useColorScheme` branch. Confirm rather than assume.
- [ ] **25. Reinstalling with an existing account skips onboarding, and it
      stays skipped.** Sign in, delete the app, reinstall: expect NO onboarding
      and straight to the tabs — the reinstall case the whole decision table in
      `should-show-onboarding.ts` exists for, and unverified anywhere else on
      this list. Then force-quit and relaunch: still no onboarding, confirming
      the flag the auto-complete branch writes was actually persisted rather
      than the pass relying on the still-live session.

## Similar games checks

- [ ] **26. Similar games stay in their tab.** Open Explore → a popular game →
      a game in its Similar Games row → another game in that one's row. The tab
      bar stays visible throughout and Explore stays selected. Back unwinds one
      level at a time. Repeat from Home and from Search.
- [ ] **27. A game with no suggestions draws no section.** The IGDB attribution
      follows the detail rows directly, with no empty heading above it. Obscure
      games are the easy case to find; before the backfill runs, every game is.
- [ ] **28. Tiles without cover art show the `gamecontroller` placeholder**, not
      a blank or a broken image. The section deliberately does not filter on
      cover art, unlike the Upcoming and Recently Released shelves.

## Backlog toolbar checks

- [ ] **29. The dots button appears only for games in the backlog.** Open an
      unadded game: no dots in the top-right corner, no rating button either —
      one glass "Add to Backlog" button and nothing else. Add it: the dots and
      the ★ button both appear. Remove it: both go. Watch the title while it
      happens — the header must not reflow or drop the title, which is the
      failure mode `ProfileToolbar` documents for header items on iOS 26.
- [ ] **30. Remove from Backlog works from the dots menu** and leaves the screen
      standing — the buttons revert to the unadded state, no pop back to the
      list.
- [ ] **31. The dots read as a round button on iOS 26 and stay legible on iOS 18.** The icon is bare `ellipsis`, so the circle comes from the native
      glass background; iOS 18 draws the glyph alone. If that is too faint,
      switch the icon to `ellipsis.circle` — which then doubles the ring on
      iOS 26.
- [ ] **32. The rating button reads as a button and its label only goes blue
      once rated.** Add a game: a filled grey capsule showing a bare ★ with the
      label in the normal text colour, clearly distinct from the background in
      light AND dark. Pick a rating: the label turns brand blue and shows the
      number. Clear it back to No rating: neutral again. This button is
      `bordered` on every iOS version rather than the `GLASS_STYLE` pair, so
      compare it against the prominent status button beside it — if the two now
      look mismatched on iOS 26, the alternative is `glass` plus
      `tint(Brand.tint)`, which colours the capsule permanently.

## Share intent checks

Added by `docs/superpowers/plans/2026-08-31-share-video-to-backlog.md`. None of
this half has run anywhere. Check 33 first: it is the only one that can fail
because of how `@expo/ui` hosts the sheet's contents rather than because of
anything in the share journey itself, and it fails in two distinguishable ways.
Check 43 is the same class of unknown and worth doing straight after it.

- [ ] **33. The sheet renders its rows, and tapping one navigates.** HIGHEST
      RISK of this section, and it fails in two ways that mean different things.
      If the sheet presents but shows _nothing_, `RNHostView` is not hosting the
      React Native subtree: `@expo/ui`'s universal layer maps to SwiftUI on iOS,
      so the `RNHostView` wrapper in `share-sheet.tsx` is the only reason RN
      children render at all — it is load-bearing, not decoration, and
      `matchContents` is mount-only. If the rows render but taps do nothing, the
      suspect is the `pointerEvents="none"` that the universal wrapper sets on
      its own `Host`
      (`@expo/ui/src/universal/BottomSheet/index.ios.tsx`), which no public prop
      can override. The escape is to compose `@expo/ui/swift-ui`'s `BottomSheet`
      directly — our own `Host` without that prop, a `Group` carrying
      `presentationDetents`, `presentationDragIndicator` and `padding`, and
      `RNHostView` inside it. About twenty lines, replicating the universal
      wrapper minus the one prop we cannot control.
- [ ] **34. Barklog appears in the share sheet** from the YouTube app, the
      TikTok app, and Safari on a watch page.
- [ ] **35. Warm launch presents the sheet; cold launch presents the sheet.**
- [ ] **36. Signed-out cold install:** `AuthView` first, sheet after sign-in.
- [ ] **37. Dismissing clears the payload** — relaunching does **not**
      re-present it.
- [ ] **38. Pick a candidate, go back: the sheet re-presents.** Presentation is
      keyed on the path being exactly `/shared`, so pushing `/shared/game/[id]`
      must collapse the sheet and popping back must bring it up again.
- [ ] **39. A private or deleted video shows the 404 copy, not a crash.**
- [ ] **40. A TikTok short link (`vm.tiktok.com`) resolves.**
- [ ] **41. Swiping the sheet away leaves the `/shared` screen standing.** The
      sheet is presented from the root layout over a `fullScreenModal`, so a
      swipe-down dismisses the sheet only: expect the opaque "Shared video"
      screen underneath with its Back to Home button, _not_ a return to the
      tabs. Then tap Back to Home and expect the Home tab with its stack intact.
- [ ] **42. A share with no link in it shows "No link in that share", not a
      spinner.** Share a photo, or text with no url. A disabled query is
      permanently pending, so this state exists only because `share-sheet.tsx`
      checks `shouldWaitForPayload`'s answer before reaching `QueryBoundary`; if
      a spinner appears instead, that branch is not being taken.
- [ ] **43. The list scrolls, and the sheet still drags from half to full.**
      Same class of unknown as 33, and the reason it is listed separately: this
      is a `UIScrollView` (the `FlatList`) inside an RN subtree inside a SwiftUI
      `Group` inside a UIKit sheet, which is exactly where a scroll gesture and
      a sheet-drag gesture fail to coordinate. Both must work: flick the list
      with the sheet at `half` and it should scroll without moving the sheet;
      drag the sheet's own grabber and it should expand to `full` without
      scrolling the list. A share with enough candidates to overflow half a
      screen is needed — search a heavily-sequelled series.
- [ ] **44. Close hides the sheet without touching the route.** Reach it by
      sharing something with no link in it (item 42), then tap Close. It sets
      state in the root layout rather than navigating, so expect the sheet to go
      and the `/shared` screen to stay, with no orphaned dimming overlay and no
      second tap needed. Confirm it does not immediately re-present: `clear()`
      has no React state behind it, so the root layout compares the dismissed
      url against the current one to know the sheet should stay closed.
- [ ] **45. Search Instead lands on the Search tab.** The one button that also
      navigates: it hides the sheet _and_ calls `router.dismissTo("/search")`,
      so the modal pops from under a sheet that is still on screen at the moment
      of the call. Reach it by sharing a video whose game is not in the
      catalogue. Expect the Search tab, its stack at the root, the `/shared`
      modal gone, and no sheet left over it.
- [ ] **46. The error state's Close behaves like 44.** Reached when payload
      resolution itself fails rather than when the share carried no link. Hard
      to force deliberately; airplane mode part-way through a share is the
      closest lever. If it cannot
      be reproduced, say so on the checklist rather than ticking it — the state
      exists precisely because the failure is not reproducible on demand.
