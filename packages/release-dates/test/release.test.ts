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

  // IGDB puts month placeholders on the 1st, quarters and most years on the
  // last day, and some old years on 1 January (design doc, #75). A vague date
  // is judged against the last day it could fall on, wherever IGDB put it.
  it.each([
    ["month on the 1st", "2027-06-01", "month", "2027-06-30"],
    ["month mid-way", "2027-06-15", "month", "2027-06-30"],
    ["February in a leap year", "2028-02-01", "month", "2028-02-29"],
    ["February in a common year", "2027-02-01", "month", "2027-02-28"],
    ["December", "2027-12-01", "month", "2027-12-31"],
    ["Q1", "2027-03-31", "quarter", "2027-03-31"],
    ["Q2 from its first day", "2027-04-01", "quarter", "2027-06-30"],
    ["Q3", "2027-09-30", "quarter", "2027-09-30"],
    ["Q4", "2027-10-15", "quarter", "2027-12-31"],
    ["year on 31 December", "2027-12-31", "year", "2027-12-31"],
    ["year on 1 January", "1998-01-01", "year", "1998-12-31"],
  ] as const)("moves a %s placeholder to the end of its period", (_, at, precision, end) => {
    expect(toReleaseDate(`${at}T00:00:00Z`, precision)).toEqual({ day: end, precision });
  });

  it("keeps the day of a precise or unclassified date as given", () => {
    expect(toReleaseDate("2027-06-01T00:00:00Z", "day").day).toBe("2027-06-01");
    expect(toReleaseDate("2027-06-01T00:00:00Z", null).day).toBe("2027-06-01");
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
    expect(() => toReleaseDate("2027-06-05T23:30:00", "day")).toThrow(RangeError);
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

  it("never lapses a vague date while today is still inside its period", () => {
    const vague = fc.constantFrom("month" as const, "quarter" as const, "year" as const);
    const period = { month: 1, quarter: 3, year: 12 };
    fc.assert(
      fc.property(instant, vague, instant, (at, p, then) => {
        const now = localDay(then, "UTC");
        const months = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
        const index = (d: Date) => Math.floor(months(d) / period[p]);
        const display = releaseDisplay(toReleaseDate(at, p), now);
        if (index(then) <= index(at)) expect(display.kind).toBe("vague");
        else expect(display.kind).toBe("lapsed");
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
