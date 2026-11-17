import type { DatePrecision } from "@repo/contracts";

import { daysBetween, toInstant, utcDay, type CalendarDay } from "./day.js";

/** Any precision other than `day` that still has a placeholder day, or unclassified. */
export type VaguePrecision = Exclude<DatePrecision, "day" | "none"> | null;

/**
 * A game's release date as the rest of the codebase sees it. `day` is the UTC
 * calendar day of IGDB's `first_release_date` (a placeholder unless the
 * precision is `day`); `precision` is `null` while the mirror has not
 * classified the date ("unclassified"), which is never guessed. Precision
 * `none` never carries a day.
 */
export type ReleaseDate =
  | { day: CalendarDay; precision: "day" | VaguePrecision }
  | { day: null; precision: DatePrecision | null };

/** What the app shows for a release date on a given local day. */
export type ReleaseDisplay =
  /** Precise and in the future; `days` is at least 1. */
  | { kind: "countdown"; days: number }
  /** Precise and today. */
  | { kind: "releaseDay" }
  /** Precise and in the past. */
  | { kind: "released" }
  /** Vague or unclassified, placeholder day today or later. */
  | { kind: "vague"; precision: VaguePrecision; day: CalendarDay }
  /** No date at all. */
  | { kind: "unannounced" }
  /** Vague or unclassified, placeholder day passed: neither upcoming nor released. */
  | { kind: "lapsed"; precision: VaguePrecision; day: CalendarDay };

/**
 * Normalises the wire/database pair into a {@link ReleaseDate}. An absent
 * (`undefined`) precision, as sent by servers that predate the field, is
 * unclassified. Precision `none` drops any stray timestamp: it means no date.
 */
export function toReleaseDate(
  firstReleaseDate: Date | string | null,
  precision: DatePrecision | null | undefined,
): ReleaseDate {
  const normalised = precision ?? null;
  if (firstReleaseDate === null || normalised === "none") {
    return { day: null, precision: normalised };
  }
  return { day: utcDay(toInstant(firstReleaseDate)), precision: normalised };
}

/** The single display state of a release date on the user's local `today`. */
export function releaseDisplay(date: ReleaseDate, today: CalendarDay): ReleaseDisplay {
  if (date.day === null) return { kind: "unannounced" };
  const days = daysBetween(today, date.day);
  if (date.precision === "day") {
    if (days > 0) return { kind: "countdown", days };
    return days === 0 ? { kind: "releaseDay" } : { kind: "released" };
  }
  const kind = days >= 0 ? "vague" : "lapsed";
  return { kind, precision: date.precision, day: date.day };
}

/**
 * Whether a game has not been released yet (CONTEXT.md, *upcoming*). A lapsed
 * placeholder is not upcoming, and not released either.
 */
export function isUpcoming(display: ReleaseDisplay): boolean {
  return display.kind !== "released" && display.kind !== "lapsed";
}
