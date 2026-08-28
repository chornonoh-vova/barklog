import { BACKLOG_STATUSES } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import {
  metaLine,
  ratingButtonLabel,
  ratingLine,
  releaseDateLine,
  releaseYear,
  rowSubtitle,
  statusButtonLabel,
  statusButtonSymbol,
  statusLabel,
} from "@/features/game/format";

describe("releaseYear", () => {
  it("extracts the year", () => {
    expect(releaseYear("2022-02-22T00:00:00.000Z")).toBe("2022");
  });

  it("returns null for an unreleased game", () => {
    expect(releaseYear(null)).toBeNull();
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

  it("omits the year when there is no release date", () => {
    expect(metaLine({ firstReleaseDate: null, genres: [{ name: "Indie" }] })).toBe("Indie");
  });

  it("omits genres when there are none", () => {
    expect(metaLine({ firstReleaseDate: "1998-11-21T00:00:00.000Z", genres: [] })).toBe("1998");
  });

  it("returns null when there is nothing to say", () => {
    expect(metaLine({ firstReleaseDate: null, genres: [] })).toBeNull();
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
    // Distinctness is the point: the capsule is the only place the status is
    // shown as a glyph, so two statuses sharing one would read as the same.
    const symbols = BACKLOG_STATUSES.map((status) => statusButtonSymbol(status));

    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols).not.toContain("plus");
  });
});

describe("ratingButtonLabel", () => {
  it("shows the rating when set", () => {
    expect(ratingButtonLabel(8)).toBe("8");
  });

  it("shows nothing but the symbol when unrated", () => {
    expect(ratingButtonLabel(null)).toBe("");
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

describe("releaseDateLine", () => {
  it("formats a full date", () => {
    expect(releaseDateLine("2022-02-22T00:00:00.000Z")).toBe("22 February 2022");
  });

  it("says unknown when there is no date", () => {
    expect(releaseDateLine(null)).toBe("Unknown");
  });
});
