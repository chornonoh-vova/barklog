import type { CalendarDay, ReleaseDate } from "@repo/release-dates";

import { formatLocale, resources, type Language } from "./locales.js";

/** Intl options per precision; a quarter is built from the numeric month and year. */
const OPTIONS = {
  day: { day: "numeric", month: "long", year: "numeric" },
  month: { month: "long", year: "numeric" },
  quarter: { month: "numeric", year: "numeric" },
  year: { year: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Cached per list row; formatted in UTC (a calendar day is a UTC day), calendar and digits pinned. */
function formatter(language: Language, precision: keyof typeof OPTIONS) {
  const key = `${language}:${precision}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(formatLocale(language), {
      ...OPTIONS[precision],
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone: "UTC",
    });
    formatters.set(key, cached);
  }
  return cached;
}

const instantOf = (day: CalendarDay) => new Date(`${day}T00:00:00Z`);

/**
 * A release date in `language`: "5 June 2027", "June 2027", "Q3 2027", "2027" or "TBA".
 * An unclassified date reads as its year, never IGDB's placeholder day.
 */
export function formatReleaseDate(date: ReleaseDate, language: Language): string {
  const copy = resources[language].app.releaseDate;
  if (date.day === null) return copy.unannounced;

  const precision = date.precision ?? "year";
  if (precision !== "quarter") return formatter(language, precision).format(instantOf(date.day));

  const parts = formatter(language, "quarter").formatToParts(instantOf(date.day));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)!.value;

  return copy.quarter
    .replace("{{quarter}}", String(Math.ceil(Number(part("month")) / 3)))
    .replace("{{year}}", part("year"));
}

/** Just the year ("2027") or "TBA", valid for every precision; for compact rows. */
export function formatReleaseYear(date: ReleaseDate, language: Language): string {
  if (date.day === null) return resources[language].app.releaseDate.unannounced;

  return formatter(language, "year").format(instantOf(date.day));
}
