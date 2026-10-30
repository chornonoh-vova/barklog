# Mobile architecture reference

Originally designed on 2026-08-27; reconciled with the implementation on 2026-10-29.
This replaces the original implementation proposal. Domain rules live in
[CONTEXT.md](../../../CONTEXT.md) and the [ADRs](../../adr/README.md); setup lives in
the [repository README](../../../README.md).

## Composition and navigation

The iOS app combines React Native lists, images and text with SwiftUI controls
inside `@expo/ui` hosts. This keeps remote artwork and virtualized lists in the
React Native layer while retaining native pickers, menus and buttons. Shared
system colours and typography live in [theme.ts](../../../apps/mobile/src/ui/theme.ts);
[platform-glass.ts](../../../apps/mobile/src/ui/platform-glass.ts) selects supported
button styles. This is a composition preference, not a ban on `RNHostView`: the
onboarding mascot and screenshot viewer use it.

The [root layout](../../../apps/mobile/src/app/_layout.tsx) installs Clerk, query,
API, purchases and theme providers. Onboarding precedes authentication. The
signed-in tree contains the tab stack and a widget observer; shared links and the
paywall are modal routes. The three tabs are Home, Explore and Search. Each has
its own game-detail route so pushing a game preserves the tab's back history;
the share modal has a fourth detail route. Routes wire parameters and navigation
into feature screens, as required by the [mobile guide](../../../apps/mobile/AGENTS.md).

[ProfileToolbar](../../../apps/mobile/src/components/profile-toolbar.tsx) uses an
app-owned avatar button and presents Clerk's `UserProfileView` in a React Native
modal. The original proposal to use `UserButton` was replaced because its native
presentation interfered with the navigation header. Premium users also have a
Customer Center action here.

## Authentication and data

[AuthGate](../../../apps/mobile/src/lib/auth/auth-gate.tsx) waits for Clerk's native
auth flow to complete, including enrollment prompts. It uses user-id changes to
coordinate query clearing, recents clearing, persisted backlog and widget clearing;
this is broader than the original sign-out-only boolean check. The intended
isolation rule and the unresolved widget queue overlap are in
[ADR-0004](../../adr/0004-account-switch-isolation.md).

The [request client](../../../apps/mobile/src/lib/api/client.ts) takes token and
fetch dependencies. It rejects a missing token, sends Bearer authentication,
retries an HTTP 401 once with a fresh token, and defensively reloads once on a
bare 304. Network and HTTP failures become `ApiError`; display copy is localized.
[Endpoints](../../../apps/mobile/src/lib/api/endpoints.ts) use the shared
[wire contract](../../../packages/contracts/src/wire.ts), keeping transport types
independent of database modules.

[Query hooks](../../../apps/mobile/src/lib/api/hooks.ts) provide one unfiltered
backlog query. Home derives sections, filters and slot information locally;
changing a filter does not fetch another list or a separate stats query. The
successful backlog list is persisted per account and revalidated on restoration.
Widgets derive their snapshot from that same query, per
[ADR-0003](../../adr/0003-derived-device-backlog.md).

[Entry writes](../../../apps/mobile/src/features/backlog/entry-writes.ts) wait for
the server and invalidate detail and backlog queries when they settle. There is
no optimistic cache patch or rollback. A move omits the rating to preserve it;
explicit `null` clears a rating. The device's slot check is advisory, a server
402 opens the paywall, and successful status changes trigger a haptic. See
[ADR-0002](../../adr/0002-server-authoritative-backlog-writes.md) and
[ADR-0005](../../adr/0005-server-derived-entitlement.md).

## Screens and supporting references

- [Home](../../../apps/mobile/src/features/backlog/backlog-screen.tsx): Playing,
  Waiting, Completed and Abandoned sections; URL-backed status filter; row menus;
  free-slot hint; stale-data rendering with background-update feedback.
- [Explore](../../../apps/mobile/src/features/explore/explore-screen.tsx): popular,
  upcoming and recently released shelves, rather than the original single list.
- [Search](../../../apps/mobile/src/features/search/search-screen.tsx): debounced
  native search, prior-result placeholders and device recents recorded when a
  result opens.
- [Game detail](../../../apps/mobile/src/features/game/game-detail-screen.tsx):
  hero, status and rating controls, summary, screenshots and full-screen viewer,
  metadata, similar games, attribution, sharing and confirmed removal.
- [Onboarding](2026-08-28-mobile-onboarding-design.md),
  [adaptive layouts](2026-10-12-ipad-duo-adaptive-layout-design.md), and
  [widgets and persistence](2026-10-21-home-screen-widgets-design.md) describe
  their current behavior and retained rationale.

## Validation and limits

Mobile uses Jest with `jest-expo/ios`, including component and route tests; the
original Vitest/pure-functions-only strategy is retired. See the
[test guide](../../../apps/mobile/test/README.md),
[auth tests](../../../apps/mobile/src/lib/auth/auth-gate.test.tsx),
[write tests](../../../apps/mobile/src/features/backlog/entry-writes.test.ts), and
[route tests](../../../apps/mobile/test/routes/tabs.test.tsx).

Native rendering, authentication, purchases and extensions still need the
[device checklist](../../mobile-device-verification.md). The presence of tests
is not a recorded passing run. Android, web and an offline write queue are not
implemented product surfaces; persisted reads do not authorize offline writes.
