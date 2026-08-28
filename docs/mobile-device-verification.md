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
pnpm --filter mobile prebuild     # required — config plugins changed
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
- [ ] **18. The Explore shelves scroll and stay aligned.** Three sections, each
      a two-row grid scrolling sideways. Check that the two rows stay aligned
      across titles of very different lengths — the fixed title and subtitle
      heights in `game-tile.tsx` are the only thing holding that — and that the
      horizontal lists nested in the vertical `ScrollView` do not fight it for
      the gesture.
