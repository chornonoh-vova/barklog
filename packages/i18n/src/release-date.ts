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

/**
 * A cached formatter: list rows format a date per game, and building one is
 * far dearer than using it. A calendar day is a UTC day, so it is formatted in
 * UTC; Latin digits and the Gregorian calendar are pinned so a device setting
 * cannot change them.
 */
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
 * A release date in `language`, worded the same in the app, the widget and
 * notifications: "5 June 2027", "June 2027", "Q3 2027", "2027" or "TBA".
 *
 * Only a precise date shows a day. An unclassified date (`null` precision)
 * reads as its year, never as the placeholder day IGDB stored.
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

/**
 * Just the year of a release date, which is right for every precision: "2027",
 * or "TBA" when there is no date. For compact places such as list rows.
 */
export function formatReleaseYear(date: ReleaseDate, language: Language): string {
  if (date.day === null) return resources[language].app.releaseDate.unannounced;

  return formatter(language, "year").format(instantOf(date.day));
}
