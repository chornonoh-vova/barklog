import type { DatePrecision } from "@repo/contracts";

/**
 * IGDB's `date_formats.format` values (the `date_formats` endpoint, checked on
 * 2026-11-18). Matched by name rather than id so a renumbering cannot silently
 * reclassify every game. `TBD` is absent on purpose: its entries carry no date,
 * so they can never match a `first_release_date`.
 */
const FORMAT_PRECISION: Readonly<Record<string, Exclude<DatePrecision, "none">>> = {
  YYYYMMDD: "day",
  YYYYMM: "month",
  YYYYQ1: "quarter",
  YYYYQ2: "quarter",
  YYYYQ3: "quarter",
  YYYYQ4: "quarter",
  YYYY: "year",
};

/** Most precise first: the order in which conflicting matches are resolved. */
const RANK: readonly DatePrecision[] = ["day", "month", "quarter", "year"];

export interface ReleaseDateEntry {
  date?: number;
  date_format?: { format?: string };
}

/**
 * How precise a game's `first_release_date` is, from the release-date entry
 * whose timestamp equals it. No date at all is `none`; a date that no entry
 * explains (or whose format we do not know) is `null` — unclassified, never
 * guessed. If several entries share the timestamp with different formats, the
 * most precise wins: a day-precise entry means some platform really launches
 * on that day. (No such conflict appeared in a 3,000-game sample.)
 */
export function classifyReleaseDate(
  firstReleaseDate: number | undefined,
  entries: readonly ReleaseDateEntry[] | undefined,
): DatePrecision | null {
  if (firstReleaseDate === undefined) return "none";

  let best: DatePrecision | null = null;
  for (const entry of entries ?? []) {
    if (entry.date !== firstReleaseDate) continue;
    const precision = FORMAT_PRECISION[entry.date_format?.format ?? ""];
    if (precision === undefined) continue;
    if (best === null || RANK.indexOf(precision) < RANK.indexOf(best)) best = precision;
  }
  return best;
}
