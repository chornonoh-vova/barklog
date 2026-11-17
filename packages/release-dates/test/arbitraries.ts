import { DATE_PRECISIONS, type DatePrecision } from "@repo/contracts";
import fc from "fast-check";

import { localDay, toReleaseDate } from "../src/index.js";

/** Instants in 2000–2099 (Pacific/Kiritimati was UTC−10 until 1995). */
export const instant = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31) })
  .map((ms) => new Date(ms));

export const calendarDay = instant.map((at) => localDay(at, "UTC"));

export const precision = fc.constantFrom<DatePrecision | null>(...DATE_PRECISIONS, null);

/** Any wire/DB pair, normalised the way every caller must. */
export const releaseDate = fc
  .tuple(fc.option(instant, { nil: null }), precision)
  .map(([at, p]) => toReleaseDate(at, p));
