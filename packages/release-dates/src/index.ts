/**
 * `@repo/release-dates` is the only place that interprets release dates
 * (ADR-0010). The API, worker and app import these functions and never compare
 * release dates or date precisions themselves.
 */
export { daysBetween, localDay, toCalendarDay, type CalendarDay } from "./day.js";
export {
  isUpcoming,
  releaseDisplay,
  toReleaseDate,
  type ReleaseDate,
  type ReleaseDisplay,
  type VaguePrecision,
} from "./release.js";
