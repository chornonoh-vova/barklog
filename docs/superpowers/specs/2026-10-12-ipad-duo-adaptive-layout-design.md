# Adaptive mobile layout reference

Originally designed on 2026-10-12; reconciled with the implementation on 2026-10-29.
This replaces the staged implementation proposal. The filename retains its
historical device naming; it is not evidence that a named simulator or SDK was
available or verified.

## Layout policy and rationale

Lay out from the content's available width and text scale, not a device model.
The [app config](../../../apps/mobile/app.json) enables tablet support and default
orientation. The [tab layout](<../../../apps/mobile/src/app/(tabs)/_layout.tsx>)
uses sidebar-adaptable native tabs. Actual sidebar presentation is a native
verification concern.

[useMeasuredWidth](../../../apps/mobile/src/ui/use-measured-width.ts) starts from
the window width, then uses the container's measured width and subtracts each
side inset independently. This accounts for a sidebar, landscape safe areas and
live window resizing. [Column helpers](../../../apps/mobile/src/ui/columns.ts)
choose one to three columns with a 320-point minimum card width scaled by text
size, capped at the accessibility threshold. Detail splitting and sheet
preference use a 700-point baseline; detail splitting also scales for text.
The helpers, rather than copied device tables, are the executable policy.

Home and Search render chunked rows through
[GameGridRow](../../../apps/mobile/src/components/game-grid-row.tsx). Home retains
a `SectionList`, Search a `FlatList`; the list is not remounted through a changing
`numColumns` key. This avoids deliberately discarding scroll state on resizing,
although native scroll-position behavior still needs a device check. One column
uses plain rows; multiple columns use grouped cards with empty trailing slots.

[Game detail](../../../apps/mobile/src/features/game/game-detail-screen.tsx)
places hero, actions and summary beside metadata when space permits, with a 3:2
width ratio. Screenshots and similar-game shelves stay full width. Profile,
paywall and share presentation prefer page sheets on wide windows; the
screenshot viewer stays full screen. Profile and screenshot modals explicitly
support rotation.

## Interaction and accessibility

- [Home row menus](../../../apps/mobile/src/features/backlog/backlog-row-menu.tsx)
  expose status, sharing and removal through a visible trailing button, separate
  from row navigation. A discoverable control was preferred to a hidden
  long-press gesture. Swipe removal was dropped because it duplicates this menu.
- [Removal confirmation](../../../apps/mobile/src/features/game/confirm-remove.ts)
  is shared by Home and detail. A confirmation was chosen over a custom undo toast.
- Spoken rating labels avoid reading a visual star as “black star.” At
  accessibility text sizes, the hero and controls reflow and row subtitles can
  wrap. [Text-size policy](../../../apps/mobile/src/ui/text-size.ts) is shared.
- Status-change haptics occur after a successful server write. The original
  optimistic haptic/rollback proposal is retired with the optimistic write model;
  [ADR-0002](../../adr/0002-server-authoritative-backlog-writes.md) governs writes.
  Moves preserve ratings by omitting them from the request.
- [Recents](../../../apps/mobile/src/features/search/recents.ts) retain up to eight
  trimmed, case-insensitively deduplicated queries, newest first. Search records
  them on result selection, and authentication requests clearing on account
  switches. See [ADR-0004](../../adr/0004-account-switch-isolation.md) for isolation.

Native split-view navigation, multiple windows, custom keyboard shortcuts and
custom pointer effects on React Native rows were outside this work. The retained
rationale is to preserve independent tab navigation and avoid new native modules
for those interactions; the old claims about particular SDK limitations are not
current compatibility guidance.

## Evidence and limits

Jest covers [column policy](../../../apps/mobile/src/ui/columns.test.ts),
[Home](../../../apps/mobile/src/features/backlog/backlog-screen.test.tsx),
[Search](../../../apps/mobile/src/features/search/search-screen.test.tsx),
[detail](../../../apps/mobile/src/features/game/game-detail-screen.test.tsx),
[row menus](../../../apps/mobile/src/features/backlog/backlog-row-menu.test.tsx),
and [recents](../../../apps/mobile/src/features/search/recents.test.ts).

Use the [device checklist](../../mobile-device-verification.md) for live resize,
asymmetric insets, VoiceOver, large text, sheets, screenshot rotation and a long
backlog's scrolling performance. Neither source inspection nor mocked tests
establish a completed native device pass. Native configuration changes require a
compatible native build; the current runtime policy is in app config, not the
original release plan's app-version assumption.
