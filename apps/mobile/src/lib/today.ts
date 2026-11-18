import { localDay, type CalendarDay } from "@repo/release-dates";
import { getCalendars } from "expo-localization";

/** The device's IANA time zone, UTC when iOS does not report one. */
export function deviceTimeZone(): string {
  return getCalendars()[0].timeZone ?? "UTC";
}

/** The device's calendar day: release dates are judged against the user's today. */
export function localToday(now: Date = new Date()): CalendarDay {
  return localDay(now, deviceTimeZone());
}
