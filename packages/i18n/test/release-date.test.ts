import { toReleaseDate } from "@repo/release-dates";
import type { DatePrecision } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { formatReleaseDate, formatReleaseYear, LANGUAGES, type Language } from "../src/index.js";

type Case = "day" | "month" | "quarter" | "year" | "none" | "unclassified";

/** 5 June 2027: a placeholder day mid-period, so a wrong precision shows. */
const AT = "2027-06-05T00:00:00.000Z";

const EXPECTED: Record<Language, Record<Case, string>> = {
  en: {
    day: "5 June 2027",
    month: "June 2027",
    quarter: "Q2 2027",
    year: "2027",
    none: "TBA",
    unclassified: "2027",
  },
  uk: {
    day: "5 червня 2027 р.",
    month: "червень 2027 р.",
    quarter: "2-й квартал 2027",
    year: "2027",
    none: "Дата невідома",
    unclassified: "2027",
  },
  ru: {
    day: "5 июня 2027 г.",
    month: "июнь 2027 г.",
    quarter: "2-й квартал 2027",
    year: "2027",
    none: "Дата неизвестна",
    unclassified: "2027",
  },
  de: {
    day: "5. Juni 2027",
    month: "Juni 2027",
    quarter: "Q2 2027",
    year: "2027",
    none: "Noch offen",
    unclassified: "2027",
  },
  es: {
    day: "5 de junio de 2027",
    month: "junio de 2027",
    quarter: "T2 2027",
    year: "2027",
    none: "Por anunciar",
    unclassified: "2027",
  },
};

const PRECISION: Record<Case, DatePrecision | null> = {
  day: "day",
  month: "month",
  quarter: "quarter",
  year: "year",
  none: "none",
  unclassified: null,
};

describe.each(LANGUAGES)("formatReleaseDate in %s", (lng) => {
  it.each(Object.keys(PRECISION) as Case[])("formats a %s date", (name) => {
    expect(formatReleaseDate(toReleaseDate(AT, PRECISION[name]), lng)).toBe(EXPECTED[lng][name]);
  });

  it("formats a missing date as unannounced, whatever its precision", () => {
    expect(formatReleaseDate(toReleaseDate(null, null), lng)).toBe(EXPECTED[lng].none);
  });
});

describe.each(LANGUAGES)("formatReleaseYear in %s", (lng) => {
  it.each(Object.keys(PRECISION) as Case[])("gives the year of a %s date", (name) => {
    expect(formatReleaseYear(toReleaseDate(AT, PRECISION[name]), lng)).toBe(
      name === "none" ? EXPECTED[lng].none : EXPECTED[lng].year,
    );
  });
});

describe("formatReleaseDate", () => {
  it.each([
    ["2027-01-01", 1],
    ["2027-03-31", 1],
    ["2027-04-01", 2],
    ["2027-09-30", 3],
    ["2027-12-31", 4],
  ])("puts %s in quarter %i", (day, quarter) => {
    expect(formatReleaseDate(toReleaseDate(`${day}T00:00:00Z`, "quarter"), "en")).toBe(
      `Q${quarter} 2027`,
    );
  });

  it("formats the UTC day, not the host's", () => {
    // Late on 31 December in UTC is already the next year east of Greenwich.
    expect(formatReleaseDate(toReleaseDate("2027-12-31T23:00:00Z", "day"), "en")).toBe(
      "31 December 2027",
    );
  });

  it("never shows an unclassified placeholder day", () => {
    for (const lng of LANGUAGES) {
      expect(formatReleaseDate(toReleaseDate(AT, null), lng)).not.toMatch(/\b5\b/);
    }
  });
});
