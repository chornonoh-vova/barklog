import type { DatePrecision } from "@repo/contracts";

/**
 * IGDB `date_formats.format` values (checked 2026-11-18), matched by name so an id
 * renumbering cannot reclassify every game. `TBD` is omitted: those entries have no date.
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

/** Most precise first; resolves conflicting matches. */
const RANK: readonly DatePrecision[] = ["day", "month", "quarter", "year"];

export interface ReleaseDateEntry {
  date?: number;
  date_format?: { format?: string };
}

/**
 * Precision of `first_release_date`, from the entry with the same timestamp: no date
 * is `none`, no matching known entry is `null` (never guessed). On conflict the most
 * precise wins, since a day entry means some platform launches that day.
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
