# Backlog stats in the Profile tab

Designed on 2026-11-17 for [#82](https://github.com/chornonoh-vova/barklog/issues/82).
Status: **implemented, pending device check**. Fills the Stats position reserved in
the [Profile tab design](2026-11-17-profile-tab-design.md).

## Intent

Bring back the backlog stats that left Home in `b6eea1b` ("N games · avg ★X"),
now as a section of the Profile tab, and make them say a little more: how the
pile splits across statuses, not only how big it is. Each status row is also a
shortcut to that slice of Home.

### Goals

- Total, a count per status and the average of the user's own ratings, derived
  from the one backlog list query ([ADR-0003](../../adr/0003-derived-device-backlog.md)).
- Tapping a status row opens Home filtered to that status.
- A new user with an empty backlog sees a way to start, not a wall of zeros.
- Spoken labels for VoiceOver; correct plurals in all five languages.

### Non-goals

- Stats on Home (they stay off it).
- A server stats endpoint, charts, or history over time.

### Anti-goals

- Claiming the backlog is empty when it has not loaded.
- A second representation of the backlog that must be kept in sync after writes.

## Approaches

| Approach                                         | Trade-off                                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **A. Two Settings rows** (Games, Average rating) | Cheapest; says no more than the old Home line.                                                                   |
| **B. Status breakdown** (picked)                 | Rows per status plus average; counts are free from the list query; native Settings look; easy to label.          |
| **C. Chart card** (stacked bar or donut)         | Most visual; needs a hand-written accessibility summary, wrapping legends, and looks foreign in a Settings list. |

Picked B in design review (2026-11-17). Computing from the backlog query is the
only way consistent with ADR-0003; a stats request or the unused
`BacklogStatsWire` type is not.

## Screen

Position: after the account group, before Release alerts (#83) and the Barklog
section.

```
 STATS · 42 GAMES
┌───────────────────────────────────────┐
│ [🕐] Waiting                      18 › │  gray tile, clock.fill      → Home ?status=waiting
│ [🎮] Playing                       3 › │  blue tile, gamecontroller.fill
│ [✓] Completed                     17 › │  green tile, checkmark.seal.fill
│ [🗑] Abandoned                     4 › │  brown tile, xmark.bin.fill
└───────────────────────────────────────┘
┌───────────────────────────────────────┐
│ [★] My average rating            7.4  │  own group; yellow tile, star.fill
│     from 31 rated games               │  subheadline, secondary; not tappable
└───────────────────────────────────────┘
```

Empty backlog (loaded, zero entries):

```
 STATS
┌───────────────────────────────────────┐
│ [🎮] Find games to add              › │  → Explore tab
└───────────────────────────────────────┘
 Your stats show up here once your backlog has games.
```

- **Header**: the total, pluralised (`gamesCount_*`, restored from `b6eea1b`).
- **Status rows**: Home's filter order (`BACKLOG_STATUSES`), the filled variant
  of Home's status symbols on the Profile tile style, count as the trailing
  secondary value, then a chevron. Rows with 0 stay and stay tappable: they land
  on Home's existing per-status empty state.
- **Tap**: Home, filtered through its `?status=` param (the route widget
  section taps use). Navigating there directly would push a second Home over a
  game left open in that tab, so when something is open there the tap switches
  to Home and pops its stack to the list first, then sets the filter (found in
  final review, 2026-11-17). With nothing to pop it does not pop: React
  Navigation reports that as an unhandled action (found on device).
- **My average rating**: the user's own ratings, so the label says "My"; mean of non-null `rating` values (1–10), one decimal,
  locale-formatted ("7,4" in German), with "from N rated games" beneath the
  title. A group of its own, so it does not read as a fifth status; no "★" in
  the value, since the tile shows one (device review, 2026-11-17). Hidden until
  at least one game is rated.
- **Loading or error**: the section is absent, as with other Profile sections
  that have no content yet.
- **Empty backlog**: one call-to-action row to Explore, with the footer above.

## Accessibility

Each row has one explicit label, so VoiceOver never reads the tile's symbol:
"Waiting, 18 games", "My average rating 7.4 out of 10, from 31 rated games", "Find games to add". The
header reads as its visible text ("Stats, 42 games"). Plurals use i18next count
forms, including Russian and Ukrainian few/many and Spanish many.

## Decided

- Variant B, tappable status rows, idea 1 placeholder (design review, 2026-11-17).
- Placeholder row opens Explore (my call, matches "Find games").

## Left to the builder (my calls, open to change)

- Tile colours above; exact copy in the four other languages.
- A pure helper (e.g. `backlogStats(items)`) plus label/spoken-label functions
  next to `profile-rows.ts`, unit-tested like it.
- Remove the unused `BacklogStatsWire` from `@repo/contracts`.
- Copy lives in `packages/i18n` for all five locales.
- Counts are subject to the `BACKLOG_SOFT_CAP` limit noted in ADR-0003.
