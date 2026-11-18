---
status: accepted
---

# Define release-date state once, as tested pure functions

Agreed on 2026-11-13; not yet implemented.

What a release date means — counted down, release day, released, vague, unannounced — and which release-alert notification a change produces are decided in one pure package, `@repo/release-dates`. The API, worker and app import it and do not compare release dates or date precisions themselves. Release dates arrive with a precision, IGDB stores vague dates as placeholder timestamps, and "today" depends on the user's time zone; scattered comparisons would disagree at exactly the edges users notice: a countdown to a placeholder, an alert on the wrong day, a bell on a released game.

There are two families of functions, because the app displays states while the worker issues notifications: `releaseDisplay` and `isUpcoming` for display, and `evaluateAlert` for the alert transition. Both share one normalisation of the date and one definition of a calendar day. The alert transition returns the next state to persist instead of writing it, so a failed send can be retried without special cases.

The package is held to a stricter testing standard than the rest of the codebase: one table-driven case per agreed scenario, property-based invariants (idempotence, nothing after done, precise-only announcements, agreement between the display and alert families, time-zone and DST edges), and full branch coverage enforced in CI.

## Amendment: vague dates end with their period

Agreed on 2026-11-18 ([#75](https://github.com/chornonoh-vova/barklog/issues/75)). The shared normalisation, `toReleaseDate`, moves a month, quarter or year date to the last day of that period. IGDB's placeholder day is not reliably at the end: months sit on the 1st and some old years on 1 January ([findings](../superpowers/specs/2026-11-13-release-alerts-and-countdowns-design.md#igdb-placeholder-dates-checked-2026-11-18-75)). Without this, a "June 2027" game would lapse on 2 June. The mirror keeps IGDB's timestamp unchanged; only the package interprets it.

## Known mismatch

Existing code predates this decision. Explore's `upcomingGames` and `recentGames` queries (`packages/db/src/queries/games.ts`) compare `first_release_date` directly and ignore precision, so "Recently Released" can list a vague game whose placeholder day has passed, which this decision says is never shown as released. The agreed fix restricts both shelves to exact (day) release dates, held to the package by an agreement test; it is a follow-up outside the release alerts design, tracked in [#89](https://github.com/chornonoh-vova/barklog/issues/89).

## Evidence

- [Release alerts design: shared foundations](../superpowers/specs/2026-11-13-release-alerts-and-countdowns-design.md)
- [Server push release alerts](0009-server-push-release-alerts.md)
