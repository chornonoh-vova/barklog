/**
 * A calendar day as `YYYY-MM-DD`, with no time or zone. Release dates are UTC
 * calendar days; "today" is a user's local calendar day. Build one with
 * {@link toCalendarDay} or {@link localDay}, never by slicing a timestamp.
 */
export type CalendarDay = string & { readonly __calendarDay: unique symbol };

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Validates a `YYYY-MM-DD` string (for example a Postgres `date`) as a calendar day. */
export function toCalendarDay(value: string): CalendarDay {
  const match = DAY_PATTERN.exec(value);
  if (match) {
    const [, year, month, day] = match.map(Number) as [number, number, number, number];
    // setUTCFullYear, unlike Date.UTC, does not map years 0–99 onto 1900–1999.
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return value as CalendarDay;
    }
  }
  throw new RangeError(`Not a calendar day: ${JSON.stringify(value)}`);
}

/**
 * An ISO 8601 date-time with an explicit `Z` or `±HH:MM` offset. Without one,
 * `Date` reads the string in the host's time zone, so the same input would
 * give different days on the server and on a device.
 */
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parses an instant. A string must be an ISO 8601 date-time with a zone (as
 * `toISOString` produces); anything else, or an invalid `Date`, is a
 * `RangeError`.
 */
export function toInstant(instant: Date | string): Date {
  const date =
    typeof instant === "string"
      ? new Date(INSTANT_PATTERN.test(instant) ? instant : Number.NaN)
      : instant;
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Not an instant: ${JSON.stringify(instant)}`);
  }
  return date;
}

/** The UTC calendar day of an instant. */
export function utcDay(instant: Date): CalendarDay {
  return instant.toISOString().slice(0, 10) as CalendarDay;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // The day is rebuilt from formatToParts rather than trusting a locale's
    // pattern; the Gregorian calendar and Latin digits are pinned so a device
    // locale cannot change the parts.
    formatter = new Intl.DateTimeFormat("en-CA-u-ca-gregory-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * The calendar day an instant falls on in an IANA time zone. Throws a
 * `RangeError` for an invalid instant or an unknown zone; callers that do not
 * know the user's zone pass `"UTC"`.
 */
export function localDay(instant: Date | string, timeZone: string): CalendarDay {
  const fields: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of formatterFor(timeZone).formatToParts(toInstant(instant))) {
    fields[type] = value;
  }
  return toCalendarDay(`${fields.year}-${fields.month}-${fields.day}`);
}

/** Whole calendar days from `from` to `to`: positive when `to` is later. */
export function daysBetween(from: CalendarDay, to: CalendarDay): number {
  return (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;
}
