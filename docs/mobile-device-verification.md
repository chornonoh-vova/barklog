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
6. `@expo/config-plugins` re-resolved from `57.0.8` to `57.0.9` on this
   branch (`pnpm-lock.yaml`), so the prebuild toolchain differs from whatever
   generated the last native project. Prebuild fresh rather than reusing an
   `ios/` directory from before this branch.

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
      two lines in `src/lib/auth/auth-gate.tsx`: render on `isSignedIn` from the
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
      `src/lib/auth/auth-gate.tsx` into `src/lib/splash.ts`, which both gates now drive
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

Added by `docs/superpowers/plans/2026-08-31-share-video-to-backlog.md`. The
candidates render on an ordinary full-screen modal screen, so nothing here
probes how React Native content survives being hosted inside SwiftUI.

The happy path is confirmed: the repo owner shared a YouTube link on a device
today, and it resolved to the correct game and rendered the candidate list.
That run exercises the YouTube-app share path of check 33 (Barklog appearing
in the share sheet requires the YouTube app, the TikTok app, and Safari; only
the first of the three was covered) and the candidate-list branch of check 37.
Everything else below — checks 34–36 and 38–43, the TikTok and Safari share
paths of check 33, and the other three states in check 37 — is still unrun.
Boxes stay unticked here; the owner ticks them as each is verified.

- [ ] **33. Barklog appears in the share sheet** from the YouTube app, the
      TikTok app, and Safari on a watch page. iOS's own share sheet, this one —
      the app no longer has a sheet of its own.
- [ ] **34. Warm launch opens `/shared`; cold launch opens `/shared`.** The
      modal should come up over the tabs either way, not replace them.
- [ ] **35. Signed-out cold install:** `AuthView` first, `/shared` after
      sign-in. The route is inside both gates, so a share must never show
      candidates to a signed-out user.
- [ ] **36. The toolbar button dismisses the modal, and lands where item 38
      promises.** It is an icon-only `xmark` with an `accessibilityLabel` of
      "Close", so the button itself no longer promises a destination — but the
      destination question this item was written to settle is still open.
      Reading the router source says `dismissTo("/")` dispatches `POP_TO`,
      which matches the root stack's `(tabs)` route **by name** and rebuilds it
      as `{ ...route, params }` — carrying the existing tab state across
      untouched — so a warm share should land back on whichever tab it
      interrupted. A cold share, where the tabs have no state yet, should
      genuinely reach Home. Check both: start on Search, share a video,
      dismiss, and note which tab you land on. **If it is Search rather than
      Home, it is item 38's claim that landing on Home is intended that is
      wrong, not the behaviour** — tell the human before changing anything,
      since they chose this affordance twice. Also confirm the candidate list
      does not start underneath the header, which is what
      `contentInsetAdjustmentBehavior="automatic"` is for.
- [ ] **37. Each of the four states renders.** Pending (a spinner, briefly);
      the candidate list; "No link in that share" for a photo or link-free text;
      and "No match in the catalogue" for a video whose game is not in the
      catalogue. The fourth, "Could not read that share", is item 42.
- [ ] **38. The toolbar close button returns to the Home tab and clears the
      payload.** It is a right-placed `Stack.Toolbar` button with an `xmark`
      icon rather than a system back button, because a modal root has nothing
      behind it to pop to. Tap it, then force-quit and relaunch: the share
      must **not** re-present, which is the `clear()` call. Landing on Home
      rather than the tab the share interrupted is intended — that is
      `dismissTo("/")`. VoiceOver must announce it as "Close".
- [ ] **39. Pick a candidate, then go back.** Selecting a row pushes
      `/shared/game/[id]` inside the modal, with the tab bar _not_ visible
      because the modal covers it. Back returns to the candidate list, still
      populated, not to the tabs.
- [ ] **40. Search Instead lands on the Search tab.** Reach it from the
      no-match state. Expect the Search tab at the root of its stack and the
      `/shared` modal gone.
- [ ] **41. A private or deleted video shows the 404 copy, not a crash.**
- [ ] **42. A TikTok short link (`vm.tiktok.com`) resolves.**
- [ ] **43. Re-sharing the identical video shows the candidates again.**
      `useIncomingShare` dedupes equal payloads against a ref, so this was a
      real risk while the hook lived at the root layout for the app's lifetime.
      It now mounts with `/shared` and every exit calls `clear()`, so a fresh
      mount should always resolve — but that reasoning is static, so share one
      video, go Home, and share the same video again. Expect candidates, not an
      empty or stuck screen.
- [ ] **44. A YouTube share shows a wide cover with no black bars.** The
      oEmbed thumbnail is `hqdefault.jpg` at 480x360 — 4:3, with letterbox
      bars baked in — and it is rendered in a 100x56 box with
      `contentFit="cover"`, which crops exactly the bars. Bars on screen mean
      the aspect in `features/share/source-thumb.ts` is being ignored.
- [ ] **45. A TikTok share shows a tall 32x56 cover.** Same row height as
      item 44; only the width differs.
- [ ] **46. A video with no thumbnail shows the placeholder, not a broken
      image.** A `play.rectangle.fill` glyph must appear at the same
      dimensions the cover would have occupied, so the row does not shift.
      This is also what an expired TikTok signed url must degrade to, via
      `onError` — hard to force on demand, so if a TikTok share ever shows
      no glyph where the cover should be, that is the bug.
      With VoiceOver on, neither the placeholder nor a loaded cover may be
      announced — the title beside it already carries that information, and
      both are marked `accessibilityElementsHidden`.
- [ ] **47. The fallback warning is legible in light and dark mode.** Share a
      video whose game cannot be identified. Expect an orange-bordered box
      with a faint orange fill and `label`-coloured copy. Toggle
      Appearance in Control Center without leaving the screen: border, glyph
      and fill must all follow, because all three are
      `PlatformColor("systemOrange")`.
- [ ] **48. The large title collapses on scroll inside the modal.** Share a
      video with enough candidates to scroll. "Shared" must start large and
      shrink into the navigation bar. This is what
      `contentInsetAdjustmentBehavior="automatic"` buys, and it is untested
      on a `fullScreenModal` root.
- [ ] **49. The no-match state still shows the header.** Share a video whose
      game is not in the catalogue. Expect the question, source row and — if
      the game could not be identified — the warning, all _above_ the "No
      match in the catalogue" state, with `Search Instead` still working from
      there. A clipped or zero-height empty state means
      `contentContainerStyle={Screen.listContent}` was dropped.

## Share game link checks

Added by the game detail share button. The payload itself is unit-tested in
`apps/mobile/src/features/game/share-game.test.ts`; everything below is the native share
sheet, which no test off-device can reach. Boxes stay unticked until run.

- [ ] **50. The share button sits left of the dots and survives backlog state
      changes.** Open an unadded game: one share glyph in the top-right, no
      dots. Add it: the dots appear to the _right_ of share, and share does not
      move. Remove it: the dots go, share stays put. Watch the title through
      both transitions for the iOS 26 header reflow that `ProfileToolbar`
      documents.
- [ ] **51. The button is dimmed while the game query is in flight.** Open a
      game on a cold cache, or with the network throttled. The share glyph must
      be present and visibly disabled until the screen fills in, then enable.
      Tapping it while dimmed does nothing and shows nothing.
- [ ] **52. The share sheet carries the IGDB page, not a bare title.** Tap
      share on a game whose IGDB page exists. Copy the link and check it reads
      `https://www.igdb.com/games/<slug>` — the same URL the "Powered by IGDB"
      credit at the bottom of the screen opens.
- [ ] **53. Messages renders a rich link preview.** Share to Messages: expect a
      card with the game's cover and title pulled from igdb.com's OpenGraph
      tags, not a naked URL. A bare link here means IGDB stopped serving those
      tags, not that the payload is wrong.
- [ ] **54. Mail pre-fills the subject with the game name.** Share to Mail:
      the subject line must be the game's name, the body the URL. This is the
      only surface that reads `options.subject`, so it is the only proof that
      half the payload is wired up.
- [ ] **55. Cancelling the sheet leaves the screen untouched.** Open share,
      swipe it away. No toast, no error, no navigation — and the button is
      immediately tappable again.
- [ ] **56. Share works from all four routes.** The same detail screen is
      mounted under Home, Explore, Search and the share-intent modal
      (`/shared/game/[id]`). Check the button appears and shares in each; the
      modal one especially, since it is a `fullScreenModal` root.
- [ ] **57. A game with punctuation in its name shares cleanly.** Find a title
      with a colon or dash — "NieR:Automata", "Hollow Knight: Silksong". The
      Mail subject must keep the punctuation verbatim, unescaped.

## Screenshot viewer checks

The first `Host` in the app to live inside a react-native `Modal`, and the
second place a hosted RN view sits inside a SwiftUI pager. Both are why this
section exists; checks 60 and 62 are regressions that already happened once.

- [ ] **58. The viewer fades in, and swiping actually pages.** It is mounted
      only once a shot is tapped, so the enter animation happens on mount —
      check it is not an abrupt cut. Open a game with several screenshots, tap
      one, swipe sideways. If the pager is dead, `pointerEvents="none"` on the
      hosted `RemoteImage` has come off — a hosted RN view swallows the swipe
      otherwise, which is what `Mascot` documents for the onboarding pager.
- [ ] **59. The viewer opens on the shot that was tapped**, not on the first
      one. Tap the fourth tile in the row and check the dots agree.
- [ ] **60. Every page draws its shot — none render black.** Swipe the whole
      way through twice, so pages get recycled. A black page means the hosted
      image lost its size: `RNHostView` must stay on `matchContents` with an
      explicitly sized child, because the other branch pushes SwiftUI's size
      into Yoga from `onGeometryChange`, which never fires for a page the
      `UIPageViewController` recycled at zero.
- [ ] **61. The dots stay readable on a game with many screenshots.** IGDB
      routinely returns 10–20. SwiftUI's page dots neither scroll nor compress,
      so if they crowd the bottom edge, switch `indexDisplayMode` to `'never'`
      and put a controlled "3 of 12" counter there instead.
- [ ] **62. The close button clears the status bar, and rotation is clean.**
      The host takes no `ignoreSafeArea` — that applied to the whole host and
      put the ✕ under the battery icon. Rotate to landscape mid-swipe: the page
      must not half-scroll or land between two shots, and the shot must resize
      with the window — the page box is clamped against window height as well
      as width, so a wide, short window must not overflow it.
- [ ] **63. The backdrop is black in light mode too.** The host is pinned to
      true black and `colorScheme="dark"`, so a phone in light mode must still
      show a black surround with light dots and a legible glass close button.
- [ ] **64. Full-size shots are sharp.** The viewer requests
      `t_screenshot_huge_2x` while the row keeps `t_screenshot_med_2x`. A soft,
      upscaled-looking image means the viewer is still on the row's transform.
- [ ] **65. VoiceOver reads each shot and the close button.** Swipe through
      with VoiceOver on: each page announces "Screenshot N of M" from
      `screenshotLabel`, and the ✕ announces as "Close screenshots". Neither
      comes from the system — @expo/ui 57's `ButtonRole` has no `close`, so the
      glyph is an explicit `xmark` `Image` and the name an `accessibilityLabel`
      modifier.
- [ ] **66. The viewer works from all four routes**, including
      `/shared/game/[id]`, where it is a `Modal` presented over a
      `fullScreenModal`. That nesting is the one most likely to misbehave.

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

Rotation inside modals (iPhone): open the screenshot viewer, rotate to
landscape — the shot turns with the phone and fills the height; rotate back.
Same for the profile screen. React Native `Modal`s are portrait-only unless
given `supportedOrientations`.

Profile sheet: swiping it down closes it (React Native blocks the native
swipe and routes it to `onRequestClose`); tapping the avatar again reopens it.

Release: 13" iPad screenshots for App Store Connect; version bump — this is a
native change and cannot ship over the air.

## HIG gaps (Stage 2, 2026-10-13)

Signed in, with a backlog of a few games in every status, on an iPhone and on
the 13" iPad (2+ columns). Part of mobile 1.2.0.

Remove confirmation: on a game detail, `…` → Remove from Backlog… shows
"Remove “<name>”?" with Cancel and Remove. Cancel leaves the game; Remove
deletes it. Same alert from the Home row menu.

Home row menu:

- Each Home row and card shows `ellipsis.circle` at the trailing edge instead
  of the chevron. Search, Explore, Similar Games and the Share sheet are
  unchanged.
- Tapping `…` opens only the menu, never the game. Tapping anywhere else on the
  row or card opens the game in the Home tab.
- Status ▸ has the current status checked. Pick another status: the row moves
  to that section, the `★` rating is unchanged, and a physical iPhone plays
  the success haptic.
- As a free user at the slot limit, moving a Completed game to Playing opens
  the paywall and changes nothing.
- Share opens the share sheet with the game's IGDB link.
- On iPad with a pointer, `…` highlights on hover.

Accessibility text sizes (Settings → Accessibility → Display & Text Size →
Larger Text, AX3 and AX5):

- Game detail: the cover sits above the title, and the status and rating buttons
  stack.
- Home: the Show/filter control stacks, and row subtitles wrap to 2 lines.
- At the largest standard size (not AX) everything stays side by side.

VoiceOver:

- A Home row reads "<name>, Playing, rated 9 out of 10" — never "black star".
- `…` reads "More, <name>".
- On a game detail, the rating button reads "Rating, 9 out of 10", or "Rate this
  game" when unrated.
- The detail's IGDB score and Home's stats line read their spoken labels —
  neither announces "black star".

Scrolling: with 200 games on a physical iPhone, Home scrolls without stutter.
If it stutters, see spec §3.4's fallback.

## Polish (Stage 3, 2026-10-13)

Section headers: Home and Share-sheet sections read "Playing 3" in title case
and headline weight, not small caps, and the count sits on the title's baseline.

Recent searches:

1. Search "hades", open a result, go back, and clear the field. Expect a
   "Recent" list showing "hades".
2. Tap "hades". The field shows "hades" and results appear.
3. Search "HADES" and open a result. There is still one entry, at the top.
4. Tap Clear. The "Fetch a game" empty state returns.
5. Sign out and sign in as another account. There are no recents.

Haptic (physical iPhone): a status change from the Home row menu plays the
success haptic once.

## iPhone Duo (Stage 3)

Needs Xcode 27.1 and its iPhone Duo simulator (Device Hub). Not run yet: only
Xcode 27.0 is installed.

For each pose:

- outer display, portrait
- outer display, landscape (tent)
- inner display, open
- inner display in ½ Split View

…on each screen: Home, Search (with results and with recents), game detail and
the screenshot viewer.

- Columns and the detail split follow the available width.
- No content sits under the status bar or camera region with asymmetric
  insets.
- Sheets (Share, paywall, profile) centre on the inner display.
- Onboarding and the screenshot viewer lay out in every pose.

Live: with Home scrolled halfway and a game detail pushed in the Search tab,
open, close and fold the device. Expect the columns to reflow without losing
the scroll position or the pushed stack.

Tab bar on the inner display: note where it sits, and whether
`sidebarAdaptable` offers the sidebar there.

## Localization (1.2)

The app follows the device language and ships English, Ukrainian, Russian,
German and Spanish. Switch per app in Settings -> Barklog -> Language; iOS
relaunches the app. A language the app does not ship falls back to English.

Settings offers the Language row only after a rebuild with the new
`expo-localization` plugin config; a JS reload is not enough.

Full pass in Ukrainian and in Russian:

- Tabs, the large titles, and the search field placeholder.
- Home: the empty backlog, each status filter's empty state, the segmented
  filter's selected label and its VoiceOver names, and the free-slots line.
- Plurals on a game's rating line pick each form: "1 оцінка", "3 оцінки",
  "5 оцінок", "21 оцінка". Hermes has no `Intl.PluralRules`, so this is the
  check that the polyfill loaded; Node-based tests cannot catch it.
- Game detail: the status and rating menus, detail rows, the release date
  ("22 лютого 2022 р."), Summary MORE/LESS, the IGDB credit with its link.
- The remove alert from the row menu and the toolbar: the title quotes the
  game name in «».
- Share a link: the searching state, each section header, no-match copy, and
  an unreadable or gone page, which shows the app's own wording rather than
  the server's English.
- Onboarding (reset it first) on every page.
- Clerk sign-in and the profile sheet, the paywall and Customer Center: their
  native UI follows the app language. The paywall's own copy comes from the
  RevenueCat dashboard and stays English until it is translated there.
- VoiceOver on a Home row and the rating button reads the translated labels.

Truncation pass in German and in Spanish, on a compact iPhone and on iPad
landscape:

- Tab labels, the segmented filter with each status selected (German
  "Abgebrochen" or "Durchgespielt" beside four icons is the tightest), the two
  capsule buttons on game detail, the free-slots line, and the onboarding
  Skip/Continue buttons.
- At an accessibility text size, the filter falls back to the "Show" menu.
