/** The only interpretation of release dates (ADR-0010); callers never compare them directly. */
export { daysBetween, localDay, toCalendarDay, type CalendarDay } from "./day.js";
export {
  isUpcoming,
  releaseDisplay,
  toReleaseDate,
  type ReleaseDate,
  type ReleaseDisplay,
  type VaguePrecision,
} from "./release.js";
