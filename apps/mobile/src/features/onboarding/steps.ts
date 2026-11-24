import type { ParseKeys } from "i18next";
import type { SFSymbol } from "sf-symbols-typescript";

/** Type-only imports, so the steps stay testable in plain Node. */
export const ONBOARDING_STEPS = ["welcome", "widgets", "free"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function nextStep(step: OnboardingStep): OnboardingStep | undefined {
  return ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(step) + 1];
}

/** One icon-title-description row, Apple welcome-sheet style. Keys, not copy:
 * read at render, after i18n is set up. */
export interface FeatureRow {
  id: string;
  systemImage: SFSymbol;
  titleKey: ParseKeys;
  descriptionKey: ParseKeys;
}

export const WELCOME_ROWS = [
  {
    id: "track",
    systemImage: "checklist",
    titleKey: "onboarding.trackTitle",
    descriptionKey: "onboarding.trackDescription",
  },
  {
    id: "explore",
    systemImage: "sparkle.magnifyingglass",
    titleKey: "onboarding.exploreRowTitle",
    descriptionKey: "onboarding.exploreRowDescription",
  },
  {
    id: "share",
    systemImage: "square.and.arrow.up",
    titleKey: "onboarding.shareRowTitle",
    descriptionKey: "onboarding.shareRowDescription",
  },
] as const satisfies readonly FeatureRow[];

/** The `slots` title is plural: render it with `{ count: FREE_ACTIVE_SLOTS }`. */
export const FREE_ROWS = [
  {
    id: "features",
    systemImage: "checkmark.circle",
    titleKey: "onboarding.freeFeaturesTitle",
    descriptionKey: "onboarding.freeFeaturesDescription",
  },
  {
    id: "slots",
    systemImage: "square.grid.2x2",
    titleKey: "onboarding.freeSlotsTitle",
    descriptionKey: "onboarding.freeSlotsDescription",
  },
  {
    id: "premium",
    systemImage: "heart",
    titleKey: "onboarding.premiumTitle",
    descriptionKey: "onboarding.premiumDescription",
  },
] as const satisfies readonly FeatureRow[];
