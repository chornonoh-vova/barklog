import { BACKLOG_STATUSES } from "@repo/contracts";

import { initI18n } from "@/lib/i18n/instance";
import { backlogItem } from "@test/fixtures";

import { averageRatingRow, backlogStats, statsTitle, statusRows } from "./backlog-stats";

afterEach(() => initI18n("en"));

describe("backlogStats", () => {
  it("counts each status and the total", () => {
    const stats = backlogStats([
      backlogItem(1, "waiting"),
      backlogItem(2, "waiting"),
      backlogItem(3, "playing"),
    ]);

    expect(stats.total).toBe(3);
    expect(stats.counts).toEqual({ waiting: 2, playing: 1, completed: 0, abandoned: 0 });
  });

  it("averages only the rated games", () => {
    const stats = backlogStats([
      backlogItem(1, "completed", { rating: 7 }),
      backlogItem(2, "completed", { rating: 8 }),
      backlogItem(3, "abandoned", { rating: 7 }),
      backlogItem(4, "waiting", { rating: null }),
    ]);

    expect(stats.averageRating).toBeCloseTo(22 / 3);
    expect(stats.ratedCount).toBe(3);
  });

  it("has no average when nothing is rated", () => {
    expect(backlogStats([backlogItem(1, "waiting", { rating: null })]).averageRating).toBeNull();
  });

  it("is all zeros for an empty backlog", () => {
    expect(backlogStats([])).toEqual({
      total: 0,
      counts: { waiting: 0, playing: 0, completed: 0, abandoned: 0 },
      averageRating: null,
      ratedCount: 0,
    });
  });
});

describe("statsTitle", () => {
  it("pluralises the total", () => {
    expect(statsTitle(1)).toBe("Stats · 1 game");
  });

  it("groups digits in a large total", () => {
    expect(statsTitle(1234)).toBe("Stats · 1,234 games");
  });

  it("uses the language's few form", () => {
    initI18n("uk");

    expect(statsTitle(3)).toContain("3 гри");
  });
});

describe("statusRows", () => {
  const stats = {
    total: 19,
    counts: { waiting: 18, playing: 1, completed: 0, abandoned: 0 },
    averageRating: null,
    ratedCount: 0,
  };

  it("has a row per status in filter order, zero counts included", () => {
    expect(statusRows(stats).map((row) => row.status)).toEqual([...BACKLOG_STATUSES]);
    expect(statusRows(stats)[2]).toMatchObject({ status: "completed", value: "0" });
  });

  it("names the status and its count for VoiceOver", () => {
    expect(statusRows(stats)[0]).toEqual({
      status: "waiting",
      title: "Waiting",
      value: "18",
      accessibilityLabel: "Waiting, 18 games",
      icon: "clock.fill",
      color: "systemGray",
    });
    expect(statusRows(stats)[1]!.accessibilityLabel).toBe("Playing, 1 game");
  });
});

describe("averageRatingRow", () => {
  it("shows one decimal, how many games it is from, and speaks the scale", () => {
    expect(averageRatingRow({ averageRating: 22 / 3, ratedCount: 3 })).toEqual({
      title: "My average rating",
      value: "7.3",
      subtitle: "from 3 rated games",
      accessibilityLabel: "My average rating 7.3 out of 10, from 3 rated games",
    });
  });

  it("keeps the decimal for a whole number", () => {
    expect(averageRatingRow({ averageRating: 7, ratedCount: 1 })).toMatchObject({
      value: "7.0",
      subtitle: "from 1 rated game",
    });
  });

  it("is absent without an average", () => {
    expect(averageRatingRow({ averageRating: null, ratedCount: 0 })).toBeNull();
  });

  it("formats the decimal in the user's locale", () => {
    initI18n("de");

    expect(averageRatingRow({ averageRating: 22 / 3, ratedCount: 3 })!.value).toBe("7,3");
  });

  it("uses the language's few form for the rated count", () => {
    initI18n("ru");

    expect(averageRatingRow({ averageRating: 8, ratedCount: 3 })!.subtitle).toBe(
      "по 3 оценённым играм",
    );
  });
});
