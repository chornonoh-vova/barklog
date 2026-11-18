import type { ReleaseDate } from "@repo/release-dates";

import { formatLocale, resources, type Language } from "./locales.js";

/** Intl options per precision; quarters are built from the year and month. */
const OPTIONS = {
  day: { day: "numeric", month: "long", year: "numeric" },
  month: { month: "long", year: "numeric" },
  year: { year: "numeric" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

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

  // A calendar day is a UTC day, so it is formatted in UTC; Latin digits and
  // the Gregorian calendar are pinned so a device setting cannot change them.
  const instant = new Date(`${date.day}T00:00:00Z`);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(formatLocale(language), {
      ...options,
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone: "UTC",
    });

  const precision = date.precision ?? "year";
  if (precision !== "quarter") return format(OPTIONS[precision]).format(instant);

  const parts = format({ month: "numeric", year: "numeric" }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)!.value;

  return copy.quarter
    .replace("{{quarter}}", String(Math.ceil(Number(part("month")) / 3)))
    .replace("{{year}}", part("year"));
}
