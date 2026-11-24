import type { DatePrecision } from "@repo/contracts";

import { daysBetween, toInstant, utcDay, type CalendarDay } from "./day.js";

/** Any precision other than `day` that still has a placeholder day, or unclassified. */
export type VaguePrecision = Exclude<DatePrecision, "day" | "none"> | null;

/**
 * A game's release date. `day` is the UTC day of `first_release_date`, except a
 * vague date uses the **last** day of its period (IGDB stores placeholders like
 * the 1st). `precision: null` means unclassified, never guessed; `none` has no day.
 */
export type ReleaseDate =
  | { day: CalendarDay; precision: "day" | VaguePrecision }
  | { day: null; precision: DatePrecision | null };

const MONTHS_IN_PERIOD = { month: 1, quarter: 3, year: 12 } as const;

/** The last UTC calendar day of the month, quarter or year containing `instant`. */
function endOfPeriod(instant: Date, precision: keyof typeof MONTHS_IN_PERIOD): CalendarDay {
  const span = MONTHS_IN_PERIOD[precision];
  const firstMonthAfter = (Math.floor(instant.getUTCMonth() / span) + 1) * span;
  // Day 0 of the next month is the period's last day; setUTCFullYear keeps years 0–99.
  const end = new Date(0);
  end.setUTCFullYear(instant.getUTCFullYear(), firstMonthAfter, 0);
  return utcDay(end);
}

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
 * Normalises the wire/database pair into a {@link ReleaseDate}. `undefined`
 * precision (older servers) is unclassified; `none` drops any stray timestamp.
 */
export function toReleaseDate(
  firstReleaseDate: Date | string | null,
  precision: DatePrecision | null | undefined,
): ReleaseDate {
  const normalised = precision ?? null;
  if (firstReleaseDate === null || normalised === "none") {
    return { day: null, precision: normalised };
  }
  const instant = toInstant(firstReleaseDate);
  if (normalised === null || normalised === "day") {
    return { day: utcDay(instant), precision: normalised };
  }
  return { day: endOfPeriod(instant, normalised), precision: normalised };
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

/** Whether a game is *upcoming* (CONTEXT.md); a lapsed placeholder is not. */
export function isUpcoming(display: ReleaseDisplay): boolean {
  return display.kind !== "released" && display.kind !== "lapsed";
}
