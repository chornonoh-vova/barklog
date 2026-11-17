# @repo/release-dates

The **only** place in Barklog that interprets release dates
([ADR-0010](../../docs/adr/0010-release-date-state-functions.md)). The API,
worker and app import these functions; none of them compares release dates,
date precisions or calendar days on its own. If you need a new question
answered about a release date, add a tested function here.

Pure functions, no runtime dependencies beyond `@repo/contracts` types.

| Function                                     | Answers                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `toReleaseDate(firstReleaseDate, precision)` | The wire/DB pair as `{ day, precision }`; `day` is the UTC calendar day, `null` precision is unclassified |
| `localDay(instant, timeZone)`                | A user's calendar day in an IANA zone (`"UTC"` when unknown)                                              |
| `daysBetween(from, to)`                      | Whole calendar days between two days                                                                      |
| `toCalendarDay(value)`                       | Validates a `YYYY-MM-DD` string, such as a Postgres `date`                                                |
| `releaseDisplay(date, today)`                | Exactly one of `countdown`, `releaseDay`, `released`, `vague`, `unannounced`, `lapsed`                    |
| `isUpcoming(display)`                        | Whether the game is _upcoming_ (CONTEXT.md); `released` and `lapsed` are not                              |

Vocabulary: **date precision**, **upcoming** ([CONTEXT.md](../../CONTEXT.md)),
**unclassified** and **lapsed**
([design](../../docs/superpowers/specs/2026-11-13-release-alerts-and-countdowns-design.md#domain-terms)).

## Testing standard

Stricter than the rest of the codebase, on purpose: one named table case per
display state, property-based invariants with `fast-check`, time-zone and DST
edge cases, and 100% statement, branch, function and line coverage. `pnpm
test` here runs with coverage, so CI fails when a threshold drops.
