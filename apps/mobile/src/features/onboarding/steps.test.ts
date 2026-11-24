import { BACKLOG_STATUSES, FREE_ACTIVE_SLOTS } from "@repo/contracts";

import {
  FREE_ROWS,
  nextStep,
  ONBOARDING_STEPS,
  WELCOME_ROWS,
  type FeatureRow,
} from "@/features/onboarding/steps";
import { i18n } from "@/lib/i18n/instance";

const description = (rows: readonly FeatureRow[], id: string) => {
  const row = rows.find((candidate) => candidate.id === id);

  return row === undefined ? undefined : i18n.t(row.descriptionKey);
};

describe("ONBOARDING_STEPS", () => {
  it("is welcome, widgets, then free", () => {
    expect(ONBOARDING_STEPS).toEqual(["welcome", "widgets", "free"]);
  });
});

describe("nextStep", () => {
  it("walks forward through every step", () => {
    expect(nextStep("welcome")).toBe("widgets");
    expect(nextStep("widgets")).toBe("free");
  });

  it("gives undefined after the last step, the signal to complete", () => {
    expect(nextStep("free")).toBeUndefined();
  });
});

describe("WELCOME_ROWS", () => {
  it("is track, explore, then share", () => {
    expect(WELCOME_ROWS.map((row) => row.id)).toEqual(["track", "explore", "share"]);
  });

  it("names every real backlog status on the track row", () => {
    // Word boundaries, not `toContain`: "playing" contains "play".
    for (const status of BACKLOG_STATUSES) {
      expect(description(WELCOME_ROWS, "track")?.toLowerCase()).toMatch(
        new RegExp(`\\b${status}\\b`),
      );
    }
  });

  it("names both launch platforms on the share row", () => {
    expect(description(WELCOME_ROWS, "share")).toContain("YouTube");
    expect(description(WELCOME_ROWS, "share")).toContain("TikTok");
  });
});

describe("FREE_ROWS", () => {
  it("is features, slots, then premium", () => {
    expect(FREE_ROWS.map((row) => row.id)).toEqual(["features", "slots", "premium"]);
  });

  it("states the free-tier cap from the shared constant", () => {
    expect(i18n.t("onboarding.freeSlotsTitle", { count: FREE_ACTIVE_SLOTS })).toContain(
      String(FREE_ACTIVE_SLOTS),
    );
  });

  it("calls the paid tier Premium, never Pro", () => {
    const copy = FREE_ROWS.flatMap((row) => [
      i18n.t(row.titleKey, { count: FREE_ACTIVE_SLOTS }),
      i18n.t(row.descriptionKey),
    ]).join(" ");

    expect(copy).toContain("Premium");
    expect(copy).not.toMatch(/\bPro\b/);
  });
});

describe("every row", () => {
  it("has copy and a symbol to show", () => {
    for (const row of [...WELCOME_ROWS, ...FREE_ROWS]) {
      expect(i18n.t(row.titleKey, { count: FREE_ACTIVE_SLOTS }).length).toBeGreaterThan(0);
      expect(i18n.t(row.descriptionKey).length).toBeGreaterThan(0);
      expect(row.systemImage.length).toBeGreaterThan(0);
    }
  });
});
