# Mobile device verification

A reusable checklist for the current implementation, reconciled on 2026-10-29.
Unchecked items describe work to verify, not known failures or a record of a
completed run. Record the commit/build, app variant, device, OS, language and
observed result when running a pass. Jest covers application behavior through
native mocks; it cannot certify real SDK presentation or extension behavior.

The earlier checklist reported one successful owner-run YouTube share, without
a build/device record. That historical observation does not certify the current
build. Obsolete branch-specific setup advice and speculative fixes are retired.

## Build and accounts

Use the [repository setup](../README.md),
[mobile scripts](../apps/mobile/package.json),
[environment example](../apps/mobile/.env.example),
[app config](../apps/mobile/app.json), and
[variant config](../apps/mobile/app.config.js). Use a development native build
that includes the configured Clerk, sharing and widget modules; a JavaScript
reload alone does not incorporate native configuration changes.

Confirm that the chosen variant's app and extensions have matching provisioning
and app-group entitlements. The config derives development and preview identifiers
as well as production identifiers; do not provision only a hardcoded production
extension name. Confirm Apple sign-in is configured for that variant and Clerk
instance. Mobile and API credentials must belong to the same Clerk instance.
A physical device needs a reachable API address, not the computer's localhost.
Use the appropriate configured RevenueCat test or App Store environment.

## Launch, onboarding and account changes

- [ ] Fresh signed-out install: five onboarding pages (welcome, backlog,
      Explore, sharing, IGDB), then non-dismissible authentication. Skip and Start
      persist across relaunch; the IGDB link opens correctly.
- [ ] Returning session: splash releases without showing onboarding or a brief
      sign-in screen. A retained session after reinstall skips onboarding and stays
      skipped after later sign-out. Distinguish the keychain session from app-local
      storage when preparing a fresh-install test.
- [ ] Apple sign-in and any enrollment prompts finish without premature dismissal.
      Authenticated requests reach the API.
- [ ] Each tab's avatar opens the profile; native dismissal and sheet swipe allow
      it to reopen. Sign-out and account deletion remain reachable in Clerk's UI.
- [ ] Switch accounts directly and through sign-out; also cold-launch signed out
      after session revocation. Check backlog, recents, persisted reads and widgets
      for prior-account data.

**Known gap:** [ADR-0004](adr/0004-account-switch-isolation.md) records widget work
that can publish stale data across an account switch. Include a switch during a
slow cover download. A normal sign-out after downloads finish does not verify
this guarantee; account ownership/cancellation remains an open implementation
question.

## Backlog, navigation and purchases

- [ ] Home, Explore and Search are the three tabs. Game and similar-game pushes
      remain in their originating tab; Back unwinds that stack.
- [ ] Home distinguishes an empty backlog from an empty status filter. Filter
      changes use the existing backlog. Cached Home survives a failed refresh;
      background updating uses the pill and a user pull uses the native spinner.
- [ ] Add, move, rate, clear rating and remove are visible after server response
      and refetch. Moving preserves the rating. Removing from Home or detail asks for
      confirmation; Cancel preserves the entry.
- [ ] Home's menu button opens only the menu, while tapping the row opens detail.
      Status changes produce one haptic after success on physical hardware;
      rating-only changes and removal do not.
- [ ] Free-tier slot checks and server 402 responses open the paywall without a
      duplicate error alert. Purchase and restore refresh server entitlement;
      Premium users can open Customer Center from the toolbar.
- [ ] Search supports typing, no-result and error states; opening a result records
      a recent query, repeated casing deduplicates it, tapping it fills the field and
      Clear removes recents. Observe 429 handling if the server returns it.
- [ ] Missing covers have placeholders; Explore and similar-game shelves remain
      aligned. A game with no suggestions omits that section.

## Shared links and sharing a game

- [ ] Share supported links from Safari and video apps in cold and warm launches.
      Authentication/onboarding gates complete before candidates appear. A repeated
      identical share opens again after the first is dismissed.
- [ ] Check pending, candidate, no-link, no-match, unreadable and network-error
      states. Source metadata remains visible with no matches; fallback warnings
      and source-opening actions reflect the returned basis.
- [ ] A candidate opens detail inside the shared modal; Back returns to candidates.
      Close clears the payload, and relaunch does not re-present the old share.
- [ ] **Close destination (legacy check 36):** record which tab appears after
      closing a warm share started from Search, and after a cold share. The route
      calls `dismissTo("/")`, but native preservation of the prior tab is still to
      be established. Do not assume the historical claim “always Home” is a verified
      requirement. [Route source](../apps/mobile/src/app/shared/index.tsx).
- [ ] Search Instead dismisses the modal and opens Search. Headers collapse and
      content clears the safe area; source thumbnails crop appropriately and failed
      images show placeholders without redundant VoiceOver announcements.
- [ ] Game sharing works from Home, Explore, Search and the share modal. The
      payload contains the IGDB game URL; Mail's subject preserves the game name.
      Cancel leaves the screen intact. Third-party rich previews are observations,
      not an app-controlled guarantee.

## Layout, accessibility and screenshots

Exercise compact and wide windows, portrait/landscape, sidebar open/closed and
live resizing on available supported devices or simulators. Record actual
hardware and OS versions rather than assuming a named future simulator exists.
Use both light/dark appearances and default/large accessibility text sizes.

- [ ] Home and Search columns reflow, detail splits when space allows, and side
      insets protect content independently. Resize with a scrolled list and a pushed
      detail: check scroll position and navigation state are retained.
- [ ] Profile, paywall and share presentations fit narrow/wide windows. Onboarding
      controls and artwork stay visible with large text and landscape.
- [ ] Hero, status/rating controls and filters reflow at accessibility sizes.
      VoiceOver gives meaningful game, status, rating and menu labels. Native pointer
      controls work; custom row hover effects and shortcuts are not promised.
- [ ] Scroll a long backlog on physical hardware and observe menu responsiveness.
      Check the React Native/SwiftUI colour seam with pale, dark and missing art.
- [ ] Screenshot viewer opens the selected image, swipes through all images and
      revisits recycled pages without blank content. Rotation and resizing preserve
      usable framing, safe-area close control and readable page indicators.
- [ ] Screenshot viewer has a dark surround in both appearances, sharp full-size
      images and spoken screenshot/close labels. Repeat from all four detail routes,
      including over the share modal.

## Localization

The configured locales are English, Ukrainian, Russian, German and Spanish.

- [ ] Check Ukrainian/Russian plural forms, release dates, alerts, search,
      onboarding, share states and VoiceOver labels in a native build.
- [ ] Check German/Spanish truncation on compact and wide windows, especially
      filters, status/rating controls, slot hints and onboarding actions.
- [ ] Unsupported device language falls back to English. Check native Clerk and
      RevenueCat UI separately; remotely configured paywall copy requires its own
      localization and is not supplied by the app's translation files.

## Widgets and persistence

Only small and medium widget families are currently configured. See the
[widget reference](superpowers/specs/2026-10-21-home-screen-widgets-design.md).

- [ ] Add before first app publication: initial signed-out text is usable even
      without a mascot. After publication, signed-out/empty states show the mascot
      when its local asset is available.
- [ ] Default section is Playing; each configured section displays its games.
      Small shows one game without a count; medium shows up to four games and the
      section's full count. Short shelves remain left-aligned; missing covers show
      the controller placeholder.
- [ ] Check light, dark and tinted appearances, long titles and large text.
- [ ] Cold and warm game taps from every active tab open Home's detail stack with
      Home underneath. Empty/header taps open Home with the intended status filter.
- [ ] Successful writes refresh the widget while the app is running. Relaunch
      restores the same account's persisted backlog and revalidates it; stale data
      remains readable when the network is unavailable.
- [ ] Run the account-switch overlap scenario above. Do not mark isolation
      complete based only on ordinary clearing or serialized queue tests.
