import { BACKLOG_STATUSES, type DatePrecision } from "@repo/contracts";
import { toCalendarDay } from "@repo/release-dates";

import {
  metaLine,
  ratingButtonLabel,
  ratingButtonSymbol,
  ratingLine,
  ratingLineSpoken,
  ratingSpoken,
  releaseDateRow,
  releaseYear,
  rowSubtitle,
  rowSubtitleSpoken,
  statusButtonLabel,
  statusButtonSymbol,
  statusLabel,
} from "@/features/game/format";

describe("releaseYear", () => {
  it("extracts the year", () => {
    expect(releaseYear({ firstReleaseDate: "2022-02-22T00:00:00.000Z" })).toBe("2022");
  });

  it("is the year for every precision", () => {
    for (const precision of ["day", "month", "quarter", "year", null] as const) {
      expect(
        releaseYear({
          firstReleaseDate: "2027-07-01T00:00:00.000Z",
          releaseDatePrecision: precision,
        }),
      ).toBe("2027");
    }
  });

  it("says TBA when there is no date", () => {
    expect(releaseYear({ firstReleaseDate: null })).toBe("TBA");
    expect(
      releaseYear({ firstReleaseDate: "2027-07-01T00:00:00.000Z", releaseDatePrecision: "none" }),
    ).toBe("TBA");
  });
});

describe("metaLine", () => {
  it("joins year and genres with a middle dot", () => {
    expect(
      metaLine({
        firstReleaseDate: "2022-02-22T00:00:00.000Z",
        genres: [{ name: "Role-playing (RPG)" }, { name: "Adventure" }],
      }),
    ).toBe("2022 · Role-playing (RPG), Adventure");
  });

  it("says TBA when there is no release date", () => {
    expect(metaLine({ firstReleaseDate: null, genres: [{ name: "Indie" }] })).toBe("TBA · Indie");
  });

  it("omits genres when there are none", () => {
    expect(metaLine({ firstReleaseDate: "1998-11-21T00:00:00.000Z", genres: [] })).toBe("1998");
  });
});

describe("releaseDateRow", () => {
  const today = toCalendarDay("2026-11-18");
  const row = (
    firstReleaseDate: string | null,
    releaseDatePrecision?: DatePrecision | null,
    on = today,
  ) => releaseDateRow({ firstReleaseDate, releaseDatePrecision }, on);

  it.each([
    ["a precise past date", "2020-03-01T00:00:00.000Z", "day", "Released", "1 March 2020"],
    ["release day", "2026-11-18T00:00:00.000Z", "day", "Release date", "18 November 2026"],
    ["a precise future date", "2027-06-05T00:00:00.000Z", "day", "Release date", "5 June 2027"],
    ["a month", "2027-06-01T00:00:00.000Z", "month", "Release date", "June 2027"],
    ["a quarter", "2027-07-01T00:00:00.000Z", "quarter", "Release date", "Q3 2027"],
    ["a year", "2027-12-31T00:00:00.000Z", "year", "Release date", "2027"],
    ["no date", null, null, "Release date", "TBA"],
    ["precision none", "2027-12-31T00:00:00.000Z", "none", "Release date", "TBA"],
  ] as const)("%s", (_, date, precision, label, value) => {
    expect(row(date, precision)).toEqual({ label, value });
  });

  it("keeps Release date on a vague date whose period has passed", () => {
    expect(row("2027-07-01T00:00:00.000Z", "quarter", toCalendarDay("2027-10-01"))).toEqual({
      label: "Release date",
      value: "Q3 2027",
    });
  });

  it("never shows a placeholder day from a server without precision", () => {
    expect(row("2027-12-31T00:00:00.000Z")).toEqual({ label: "Release date", value: "2027" });
    expect(row("2020-03-01T00:00:00.000Z")).toEqual({ label: "Release date", value: "2020" });
  });
});

describe("ratingLine", () => {
  it("rounds the rating and groups the count", () => {
    expect(ratingLine({ totalRating: 95.6231, totalRatingCount: 12481 })).toBe(
      "★ 96 · 12,481 ratings",
    );
  });

  it("says rating for a single rating", () => {
    expect(ratingLine({ totalRating: 80, totalRatingCount: 1 })).toBe("★ 80 · 1 rating");
  });

  it("returns null for an unrated game", () => {
    expect(ratingLine({ totalRating: null, totalRatingCount: 0 })).toBeNull();
  });
});

describe("statusLabel", () => {
  it("titlecases every status", () => {
    expect(statusLabel("waiting")).toBe("Waiting");
    expect(statusLabel("playing")).toBe("Playing");
    expect(statusLabel("completed")).toBe("Completed");
    expect(statusLabel("abandoned")).toBe("Abandoned");
  });

  it("has a label for every status in the enum", () => {
    for (const status of BACKLOG_STATUSES) {
      expect(statusLabel(status)).not.toBe("");
    }
  });
});

describe("statusButtonLabel", () => {
  it("prompts to add when the game is untracked", () => {
    expect(statusButtonLabel(null)).toBe("Add to Backlog");
  });

  it("shows the current status when tracked", () => {
    expect(statusButtonLabel("playing")).toBe("Playing");
  });
});

describe("statusButtonSymbol", () => {
  it("shows the add affordance when the game is untracked", () => {
    expect(statusButtonSymbol(null)).toBe("plus");
  });

  it("pins the symbol for each status", () => {
    expect(statusButtonSymbol("waiting")).toBe("clock");
    expect(statusButtonSymbol("playing")).toBe("gamecontroller");
    expect(statusButtonSymbol("completed")).toBe("checkmark.seal");
    expect(statusButtonSymbol("abandoned")).toBe("xmark.bin");
  });

  it("gives every status in the enum its own symbol", () => {
    const symbols = BACKLOG_STATUSES.map((status) => statusButtonSymbol(status));

    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols).not.toContain("plus");
  });
});

describe("ratingButtonLabel", () => {
  it("shows the rating when set", () => {
    expect(ratingButtonLabel(8)).toBe("8");
  });

  it("invites a rating when unrated", () => {
    expect(ratingButtonLabel(null)).toBe("Rate");
  });
});

describe("rowSubtitle", () => {
  it("combines status and rating", () => {
    expect(rowSubtitle({ status: "playing", rating: 9 })).toBe("Playing · ★9");
  });

  it("shows only the status when unrated", () => {
    expect(rowSubtitle({ status: "waiting", rating: null })).toBe("Waiting");
  });
});

describe("ratingButtonSymbol", () => {
  it("is an outline star when unrated", () => {
    expect(ratingButtonSymbol(null)).toBe("star");
  });

  it("is a filled star when rated", () => {
    expect(ratingButtonSymbol(7)).toBe("star.fill");
  });
});

describe("ratingSpoken", () => {
  it("reads the rating out of the maximum", () => {
    expect(ratingSpoken(9)).toBe("Rating, 9 out of 10");
  });

  it("invites a rating when unrated", () => {
    expect(ratingSpoken(null)).toBe("Rate this game");
  });
});

describe("rowSubtitleSpoken", () => {
  it("never contains the star glyph", () => {
    expect(rowSubtitleSpoken({ status: "playing", rating: 9 })).toBe("Playing, rated 9 out of 10");
  });

  it("is the status alone when unrated", () => {
    expect(rowSubtitleSpoken({ status: "waiting", rating: null })).toBe("Waiting");
  });
});

describe("ratingLineSpoken", () => {
  it("reads the IGDB score out of 100 with its count", () => {
    expect(ratingLineSpoken({ totalRating: 95.6231, totalRatingCount: 12481 })).toBe(
      "Rated 96 out of 100, from 12,481 ratings",
    );
  });

  it("says rating for a single rating", () => {
    expect(ratingLineSpoken({ totalRating: 80, totalRatingCount: 1 })).toBe(
      "Rated 80 out of 100, from 1 rating",
    );
  });

  it("returns null for an unrated game", () => {
    expect(ratingLineSpoken({ totalRating: null, totalRatingCount: 0 })).toBeNull();
  });
});
