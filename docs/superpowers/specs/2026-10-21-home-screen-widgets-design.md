# Home-screen widgets and persisted backlog reference

Originally designed on 2026-10-21; reconciled with the implementation on 2026-10-29.
This replaces the implementation proposal. [ADR-0003](../../adr/0003-derived-device-backlog.md)
defines the shared read model; [ADR-0004](../../adr/0004-account-switch-isolation.md)
records the unresolved account-switch guarantee.

## Purpose and authority

The widget brings a backlog section onto the home screen. Persisted backlog lets
Home render its last successful response before a new request completes. Both
are derived device views: the server remains authoritative, and neither provides
an offline write queue or an independent backlog to merge back into the app.
Widgets have no Premium check and do not fetch independently in the extension.
Freshness depends on the app observing/refetching the backlog; updates made on
another device need not appear until that happens.

## Current widget

[App config](../../../apps/mobile/app.json) declares one `BacklogWidget`, with
**small and medium** families only. Configuration chooses Playing (default),
Waiting, Completed or Abandoned. Configuration labels are currently English.
[Variant config](../../../apps/mobile/app.config.js) derives bundle identifiers
and the app group together, including the widget target.

The [view](../../../apps/mobile/src/features/widgets/backlog-widget.tsx) renders:

- Small: the most recently updated game, with cover, title and optional rating;
  the whole widget opens that game. It omits the section count.
- Medium: four equal game slots, left-aligned when fewer games exist, plus the
  full section count. Each game has its own link. The original three-cover
  proposal is retired; large and accessory families are not configured.
- Empty section: a section message and mascot when available; the tap opens Home
  with that status filter. Signed-out state opens Home and asks the user to open
  Barklog. Before the app first publishes, its initial English snapshot has no
  mascot file and therefore renders text only.

The view uses a system-like light/dark background, placeholder symbols for
missing covers and desaturated covers in accented mode. Its isolated widget
runtime receives all data through props; it cannot run the app's query or i18n
hooks.

[Snapshot derivation](../../../apps/mobile/src/features/widgets/snapshot.ts)
sorts each status by update time, retains four games and keeps the full count.
Localized copy and URLs are computed in the app. Native props use empty strings
for missing images and zero for an unrated game, avoiding `null` in UserDefaults.
[Covers](../../../apps/mobile/src/features/widgets/covers.ts) download into the
widget app-group directory, copy the bundled PNG mascot there, and prune unused
covers after publication. Download failures yield placeholders.

[WidgetSync](../../../apps/mobile/src/features/widgets/widget-sync.tsx) observes
the same unfiltered `useBacklog()` as Home even when Home is not mounted.
[The queue](../../../apps/mobile/src/features/widgets/sync.ts) serializes work,
keeps the latest pending job, and deduplicates identical serialized snapshots
in memory. Restored query data can also publish a snapshot. Failed jobs are
best-effort and can leave the prior snapshot visible.

## Routing

[Widget links](../../../apps/mobile/src/features/widgets/links.ts) use
`barklog://widget/game/<id>` and `barklog://widget/home/<status>`.
[Native intent routing](../../../apps/mobile/src/app/+native-intent.ts) maps them
explicitly into the Home stack, including the triple-slash spelling received
from iOS. This avoids relying on ambiguous `game/[id]` routes in other tabs.
Home's filter is backed by the `status` parameter; an entirely empty backlog
clears that parameter so the first add does not leave a misleading empty filter.
Cold and warm widget navigation still need native verification.

## Persistence and loading

[Persistence](../../../apps/mobile/src/lib/query/query-persist.ts) starts and stops
from `AuthGate` for the current Clerk user. It uses `persistQueryClient`, not the
original proposed `PersistQueryClientProvider` wrapper.
[Policy](../../../apps/mobile/src/lib/query/query-persist-policy.ts) persists only
the successful unfiltered backlog list under a per-account key, with a seven-day
age limit and a buster combining app version and update id. Search, detail and
entitlement queries are not persisted.

Restored data is stale starting data. Revalidation avoids replacing a newer
fetch and does not cancel an in-flight fetch. A stop guard suppresses late
restoration and queued storage writes after persistence is stopped. Clearing
removes other accounts' saved caches while preserving the current account's key.

[Home](../../../apps/mobile/src/features/backlog/backlog-screen.tsx) shows a
full-screen loading state when no data is available, and an
[Updating pill](../../../apps/mobile/src/components/updating-pill.tsx) for
background fetching with data. A user pull uses its native refresh spinner.

## Account-switch clearing: unresolved guarantee

`AuthGate` requests a signed-out widget snapshot, cover clearing, recents clearing
and persisted-cache clearing when the account changes or a signed-out cold start
finds old device data. **This does not establish complete widget isolation.**
An in-flight cover download can still publish the previous user's backlog after
a clear was requested; a newer queued push can replace a pending clear. Current
queue tests drain a previous push before clearing, so they do not cover that
overlap. The ownership/cancellation design remains open in
[ADR-0004](../../adr/0004-account-switch-isolation.md). A deferred-download
account-switch regression is needed before selecting a fix.

## Evidence and native checks

Tests cover [snapshots](../../../apps/mobile/src/features/widgets/snapshot.test.ts),
[links](../../../apps/mobile/src/features/widgets/links.test.ts),
[covers](../../../apps/mobile/src/features/widgets/covers.test.ts),
[queue behavior](../../../apps/mobile/src/features/widgets/sync.test.ts),
[observer wiring](../../../apps/mobile/src/features/widgets/widget-sync.test.tsx),
and [persistence](../../../apps/mobile/src/lib/query/query-persist.test.ts).
Jest does not execute the isolated widget view. Use the
[device checklist](../../mobile-device-verification.md) for rendering,
configuration, app-group provisioning, tinted mode and cold/warm taps. This
reference does not certify a passing build or device run.
