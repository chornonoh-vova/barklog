import { localDay, type CalendarDay } from "@repo/release-dates";
import { getCalendars } from "expo-localization";

/** The device's IANA time zone, UTC when iOS does not report one. */
export function deviceTimeZone(): string {
  return getCalendars()[0].timeZone ?? "UTC";
}

/**
 * The device's calendar day: release dates are judged against the user's today.
 * A zone Hermes' Intl does not know (one newer than its tz data) falls back to
 * the UTC day, as when iOS reports none, instead of crashing the screen.
 */
export function localToday(now: Date = new Date()): CalendarDay {
  try {
    return localDay(now, deviceTimeZone());
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return localDay(now, "UTC");
  }
}
