---
status: accepted
---

# Define release-date state once, as tested pure functions

Agreed on 2026-11-13; not yet implemented.

What a release date means — counted down, release day, released, vague, unannounced — and which release-alert notification a change produces are decided in one pure package, `@repo/release-dates`. The API, worker and app import it and do not compare release dates or date precisions themselves. Release dates arrive with a precision, IGDB stores vague dates as placeholder timestamps, and "today" depends on the user's time zone; scattered comparisons would disagree at exactly the edges users notice: a countdown to a placeholder, an alert on the wrong day, a bell on a released game.

There are two families of functions, because the app displays states while the worker issues notifications: `releaseDisplay` and `isUpcoming` for display, and `evaluateAlert` for the alert transition. Both share one normalisation of the date and one definition of a calendar day. The alert transition returns the next state to persist instead of writing it, so a failed send can be retried without special cases.

The package is held to a stricter testing standard than the rest of the codebase: one table-driven case per agreed scenario, property-based invariants (idempotence, nothing after done, precise-only announcements, agreement between the display and alert families, time-zone and DST edges), and full branch coverage enforced in CI.

## Known mismatch

Existing code predates this decision. Explore's `upcomingGames` and `recentGames` queries (`packages/db/src/queries/games.ts`) compare `first_release_date` directly and ignore precision, so "Recently Released" can list a vague game whose placeholder day has passed, which this decision says is never shown as released. Moving them onto `@repo/release-dates` is a follow-up outside the release alerts design.

## Evidence

- [Release alerts design: shared foundations](../superpowers/specs/2026-11-13-release-alerts-and-countdowns-design.md)
- [Server push release alerts](0009-server-push-release-alerts.md)
