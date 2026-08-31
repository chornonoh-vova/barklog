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
