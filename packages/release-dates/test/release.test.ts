import { DATE_PRECISIONS } from "@repo/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  daysBetween,
  isUpcoming,
  localDay,
  releaseDisplay,
  toCalendarDay,
  toReleaseDate,
  type ReleaseDate,
  type ReleaseDisplay,
} from "../src/index.js";
import { calendarDay, instant, releaseDate } from "./arbitraries.js";

const day = toCalendarDay;
const today = day("2027-06-05");
const MS_PER_DAY = 86_400_000;

/** Whether each display state is *upcoming*; the compiler keeps it complete. */
const UPCOMING = {
  countdown: true,
  releaseDay: true,
  released: false,
  vague: true,
  unannounced: true,
  lapsed: false,
} satisfies Record<ReleaseDisplay["kind"], boolean>;

describe("toReleaseDate", () => {
  it("takes the UTC calendar day of the timestamp", () => {
    expect(toReleaseDate("2027-06-05T00:00:00.000Z", "day")).toEqual({
      day: "2027-06-05",
      precision: "day",
    });
    expect(toReleaseDate("2027-06-05T23:59:59.999Z", "day").day).toBe("2027-06-05");
    // An offset in the string does not move the day off UTC.
    expect(toReleaseDate("2027-06-05T23:30:00-02:00", "day").day).toBe("2027-06-06");
    expect(toReleaseDate(new Date(Date.UTC(2027, 11, 31, 12)), "year").day).toBe("2027-12-31");
  });

  it("keeps an absent precision as unclassified rather than guessing", () => {
    expect(toReleaseDate("2027-06-05T00:00:00Z", null)).toEqual({
      day: "2027-06-05",
      precision: null,
    });
    expect(toReleaseDate("2027-06-05T00:00:00Z", undefined).precision).toBeNull();
  });

  it("has no day without a timestamp", () => {
    expect(toReleaseDate(null, "none")).toEqual({ day: null, precision: "none" });
    expect(toReleaseDate(null, null)).toEqual({ day: null, precision: null });
  });

  it("drops a stray timestamp when the precision is none", () => {
    expect(toReleaseDate("2027-06-05T00:00:00Z", "none")).toEqual({ day: null, precision: "none" });
  });

  it("rejects an invalid timestamp", () => {
    expect(() => toReleaseDate("soon", "day")).toThrow(RangeError);
  });
});

describe("releaseDisplay", () => {
  const cases: { name: string; date: ReleaseDate; expected: ReleaseDisplay }[] = [
    {
      name: "countdown: precise day in the future",
      date: { day: day("2027-06-12"), precision: "day" },
      expected: { kind: "countdown", days: 7 },
    },
    {
      name: "countdown: precise day tomorrow counts one day",
      date: { day: day("2027-06-06"), precision: "day" },
      expected: { kind: "countdown", days: 1 },
    },
    {
      name: "releaseDay: precise day is today",
      date: { day: today, precision: "day" },
      expected: { kind: "releaseDay" },
    },
    {
      name: "released: precise day in the past",
      date: { day: day("2027-06-04"), precision: "day" },
      expected: { kind: "released" },
    },
    {
      name: "vague: month placeholder in the future",
      date: { day: day("2027-09-30"), precision: "month" },
      expected: { kind: "vague", precision: "month", day: day("2027-09-30") },
    },
    {
      name: "vague: quarter placeholder is today",
      date: { day: today, precision: "quarter" },
      expected: { kind: "vague", precision: "quarter", day: today },
    },
    {
      name: "vague: year placeholder in the future",
      date: { day: day("2027-12-31"), precision: "year" },
      expected: { kind: "vague", precision: "year", day: day("2027-12-31") },
    },
    {
      name: "vague: unclassified precision with a future date",
      date: { day: day("2027-06-12"), precision: null },
      expected: { kind: "vague", precision: null, day: day("2027-06-12") },
    },
    {
      name: "unannounced: no date at all",
      date: { day: null, precision: "none" },
      expected: { kind: "unannounced" },
    },
    {
      name: "unannounced: unclassified precision and no date",
      date: { day: null, precision: null },
      expected: { kind: "unannounced" },
    },
    {
      name: "lapsed: month placeholder has passed",
      date: { day: day("2027-05-31"), precision: "month" },
      expected: { kind: "lapsed", precision: "month", day: day("2027-05-31") },
    },
    {
      name: "lapsed: year placeholder passed yesterday",
      date: { day: day("2027-06-04"), precision: "year" },
      expected: { kind: "lapsed", precision: "year", day: day("2027-06-04") },
    },
    {
      name: "lapsed: unclassified date has passed",
      date: { day: day("2027-06-04"), precision: null },
      expected: { kind: "lapsed", precision: null, day: day("2027-06-04") },
    },
  ];

  it.each(cases)("$name", ({ date, expected }) => {
    const display = releaseDisplay(date, today);
    expect(display).toEqual(expected);
    expect(isUpcoming(display)).toBe(UPCOMING[expected.kind]);
  });

  it("covers every display state in the table", () => {
    expect(new Set(cases.map((c) => c.expected.kind))).toEqual(new Set(Object.keys(UPCOMING)));
  });
});

describe("releaseDisplay properties", () => {
  it("counts down a positive number of days exactly when a precise day is after today", () => {
    fc.assert(
      fc.property(calendarDay, calendarDay, (released, now) => {
        const days = daysBetween(now, released);
        const display = releaseDisplay({ day: released, precision: "day" }, now);
        expect(display.kind === "countdown").toBe(days > 0);
        if (display.kind === "countdown") expect(display.days).toBe(days);
      }),
    );
  });

  it("is releaseDay exactly when a precise day is today", () => {
    fc.assert(
      fc.property(releaseDate, calendarDay, (date, now) => {
        const display = releaseDisplay(date, now);
        expect(display.kind === "releaseDay").toBe(date.precision === "day" && date.day === now);
      }),
    );
  });

  it("never treats a non-day precision as a day", () => {
    const nonDay = fc.constantFrom(...DATE_PRECISIONS.filter((p) => p !== "day"), null);
    fc.assert(
      fc.property(fc.option(instant, { nil: null }), nonDay, calendarDay, (at, p, now) => {
        const { kind } = releaseDisplay(toReleaseDate(at, p), now);
        expect(["countdown", "releaseDay", "released"]).not.toContain(kind);
      }),
    );
  });

  it("only becomes non-upcoming as today moves forward, never back", () => {
    fc.assert(
      fc.property(releaseDate, calendarDay, fc.nat(4000), (date, now, step) => {
        const later = localDay(new Date(Date.parse(now) + step * MS_PER_DAY), "UTC");
        if (!isUpcoming(releaseDisplay(date, now))) {
          expect(isUpcoming(releaseDisplay(date, later))).toBe(false);
        }
      }),
    );
  });
});
