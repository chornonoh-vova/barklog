import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { daysBetween, localDay, toCalendarDay, type CalendarDay } from "../src/index.js";
import { calendarDay, instant } from "./arbitraries.js";

const day = toCalendarDay;

const zones = [
  "UTC",
  "Etc/GMT+12", // UTC−12
  "Pacific/Pago_Pago", // UTC−11
  "Pacific/Honolulu",
  "America/Los_Angeles",
  "America/New_York",
  "America/St_Johns", // −03:30 / −02:30
  "Europe/London",
  "Europe/Kyiv",
  "Asia/Kolkata", // +05:30
  "Asia/Kathmandu", // +05:45
  "Australia/Lord_Howe", // 30-minute DST shift
  "Pacific/Chatham", // +12:45 / +13:45
  "Pacific/Tongatapu", // +13
  "Pacific/Kiritimati", // UTC+14
] as const;

describe("toCalendarDay", () => {
  it("accepts a real YYYY-MM-DD day", () => {
    expect(toCalendarDay("2027-06-05")).toBe("2027-06-05");
    expect(toCalendarDay("2028-02-29")).toBe("2028-02-29");
  });

  it.each(["2027-6-5", "2027-06-05T00:00:00Z", "", "2027-02-29", "2027-13-01", "2027-04-31"])(
    "rejects %j",
    (value) => {
      expect(() => toCalendarDay(value)).toThrow(RangeError);
    },
  );
});

describe("daysBetween", () => {
  it("counts calendar days from the first day to the second", () => {
    expect(daysBetween(day("2027-06-05"), day("2027-06-05"))).toBe(0);
    expect(daysBetween(day("2027-06-05"), day("2027-06-06"))).toBe(1);
    expect(daysBetween(day("2027-06-06"), day("2027-06-05"))).toBe(-1);
    expect(daysBetween(day("2027-12-31"), day("2028-01-01"))).toBe(1);
    expect(daysBetween(day("2028-02-28"), day("2028-03-01"))).toBe(2);
    expect(daysBetween(day("2027-01-01"), day("2028-01-01"))).toBe(365);
  });

  it("is antisymmetric and additive", () => {
    fc.assert(
      fc.property(calendarDay, calendarDay, calendarDay, (a, b, c) => {
        expect(daysBetween(a, b)).toBe(-daysBetween(b, a) || 0);
        expect(daysBetween(a, c)).toBe(daysBetween(a, b) + daysBetween(b, c));
      }),
    );
  });
});

describe("localDay", () => {
  it("is the UTC date in UTC", () => {
    fc.assert(
      fc.property(instant, (at) => {
        expect(localDay(at, "UTC")).toBe(at.toISOString().slice(0, 10));
      }),
    );
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(localDay("2027-06-05T23:30:00Z", "Europe/Kyiv")).toBe("2027-06-06");
    expect(localDay(new Date("2027-06-05T23:30:00Z"), "Europe/Kyiv")).toBe("2027-06-06");
  });

  it("rejects an invalid instant", () => {
    expect(() => localDay("not a date", "UTC")).toThrow(RangeError);
  });

  it("rejects an unknown time zone", () => {
    expect(() => localDay(new Date(0), "Mars/Olympus_Mons")).toThrow(RangeError);
  });

  describe("at the extreme offsets", () => {
    // 2027-06-05 11:30 UTC is still the 4th at UTC−12 and already the 6th at UTC+14.
    const at = "2027-06-05T11:30:00Z";

    it.each([
      ["Etc/GMT+12", "2027-06-04"],
      ["UTC", "2027-06-05"],
      ["Pacific/Kiritimati", "2027-06-06"],
    ])("%s", (zone, expected) => {
      expect(localDay(at, zone)).toBe(expected);
    });
  });

  describe("across DST transitions", () => {
    it.each([
      // America/New_York springs forward at 2026-03-08 02:00 local (07:00 UTC).
      ["America/New_York", "2026-03-08T04:59:59Z", "2026-03-07"],
      ["America/New_York", "2026-03-08T05:00:00Z", "2026-03-08"],
      ["America/New_York", "2026-03-09T03:59:59Z", "2026-03-08"], // 23:59:59 EDT
      ["America/New_York", "2026-03-09T04:00:00Z", "2026-03-09"],
      // Falls back at 2026-11-01 02:00 local (06:00 UTC): a 25-hour day.
      ["America/New_York", "2026-11-01T03:59:59Z", "2026-10-31"], // 23:59:59 EDT
      ["America/New_York", "2026-11-01T04:00:00Z", "2026-11-01"],
      ["America/New_York", "2026-11-02T04:59:59Z", "2026-11-01"], // 23:59:59 EST
      ["America/New_York", "2026-11-02T05:00:00Z", "2026-11-02"],
      // Europe/Kyiv: forward at 2027-03-28 01:00 UTC, back at 2027-10-31 01:00 UTC.
      ["Europe/Kyiv", "2027-03-27T21:59:59Z", "2027-03-27"],
      ["Europe/Kyiv", "2027-03-27T22:00:00Z", "2027-03-28"],
      ["Europe/Kyiv", "2027-03-28T20:59:59Z", "2027-03-28"],
      ["Europe/Kyiv", "2027-03-28T21:00:00Z", "2027-03-29"],
      ["Europe/Kyiv", "2027-10-30T20:59:59Z", "2027-10-30"],
      ["Europe/Kyiv", "2027-10-30T21:00:00Z", "2027-10-31"],
      ["Europe/Kyiv", "2027-10-31T21:59:59Z", "2027-10-31"],
      ["Europe/Kyiv", "2027-10-31T22:00:00Z", "2027-11-01"],
      // Australia/Lord_Howe shifts by 30 minutes (+10:30 ↔ +11).
      ["Australia/Lord_Howe", "2026-10-03T13:29:59Z", "2026-10-03"],
      ["Australia/Lord_Howe", "2026-10-03T13:30:00Z", "2026-10-04"],
      ["Australia/Lord_Howe", "2026-10-04T12:59:59Z", "2026-10-04"],
      ["Australia/Lord_Howe", "2026-10-04T13:00:00Z", "2026-10-05"],
    ])("%s at %s is %s", (zone, at, expected) => {
      expect(localDay(at, zone)).toBe(expected);
    });

    it("never skips or repeats a day hour by hour through a DST year", () => {
      const start = Date.UTC(2026, 0, 1);
      const end = Date.UTC(2027, 0, 1);
      for (const zone of zones) {
        let previous: CalendarDay | null = null;
        for (let ms = start; ms < end; ms += 60 * 60 * 1000) {
          const current = localDay(new Date(ms), zone);
          if (previous !== null) {
            const step = daysBetween(previous, current);
            if (step !== 0 && step !== 1) {
              expect.fail(`${zone} at ${new Date(ms).toISOString()} stepped ${step} days`);
            }
          }
          previous = current;
        }
      }
    });
  });

  it("is within one day of the UTC day in every zone from UTC−12 to UTC+14", () => {
    fc.assert(
      fc.property(instant, fc.constantFrom(...zones), (at, zone) => {
        const offset = daysBetween(localDay(at, "UTC"), localDay(at, zone));
        expect(Math.abs(offset)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("is never earlier at UTC+14 than at UTC−12, and at most two days later", () => {
    fc.assert(
      fc.property(instant, (at) => {
        const spread = daysBetween(localDay(at, "Etc/GMT+12"), localDay(at, "Pacific/Kiritimati"));
        expect(spread).toBeGreaterThanOrEqual(1);
        expect(spread).toBeLessThanOrEqual(2);
      }),
    );
  });
});
