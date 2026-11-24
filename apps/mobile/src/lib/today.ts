import { localDay, type CalendarDay } from "@repo/release-dates";
import { getCalendars } from "expo-localization";

export function deviceTimeZone(): string {
  return getCalendars()[0].timeZone ?? "UTC";
}

/** A zone newer than Hermes' tz data falls back to the UTC day instead of throwing. */
export function localToday(now: Date = new Date()): CalendarDay {
  try {
    return localDay(now, deviceTimeZone());
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return localDay(now, "UTC");
  }
}
