import type { ParseKeys } from "i18next";
import type { SFSymbol } from "sf-symbols-typescript";

import type { IllustrationName } from "@/components/illustrations";

/** No react-native or @expo/ui anywhere in this module's graph — every import
 * above is a type, which erases at compile — so the pages are testable in plain
 * Node. */
export interface OnboardingPage {
  id: string;
  /** Kept required alongside `illustration`: the attribution page has no mascot
   * of its own and falls back to this. */
  systemImage: SFSymbol;
  illustration?: IllustrationName;
  /** Keys, not copy: read at render, after i18n is set up. */
  titleKey: ParseKeys;
  descriptionKey: ParseKeys;
}

export const IGDB_PAGE_ID = "igdb";

/** `as const satisfies`, not an annotation: the tuple keeps its literal length,
 * which is what lets a caller index `[0]` without a non-null assertion. */
export const ONBOARDING_PAGES = [
  {
    id: "welcome",
    illustration: "default",
    systemImage: "pawprint.fill",
    titleKey: "onboarding.welcomeTitle",
    descriptionKey: "onboarding.welcomeDescription",
  },
  {
    id: "backlog",
    illustration: "backlog",
    systemImage: "checklist",
    titleKey: "onboarding.backlogTitle",
    descriptionKey: "onboarding.backlogDescription",
  },
  {
    id: "explore",
    illustration: "explore",
    systemImage: "sparkle.magnifyingglass",
    titleKey: "onboarding.exploreTitle",
    descriptionKey: "onboarding.exploreDescription",
  },
  {
    id: "share",
    illustration: "share",
    systemImage: "square.and.arrow.up",
    titleKey: "onboarding.shareTitle",
    descriptionKey: "onboarding.shareDescription",
  },
  {
    id: IGDB_PAGE_ID,
    // Spelled out rather than left off: `as const satisfies` keeps each page's
    // literal shape, so a page missing the key would drop it from the union and
    // put `page.illustration` out of reach at every call site.
    illustration: undefined,
    systemImage: "books.vertical.fill",
    titleKey: "onboarding.igdbTitle",
    descriptionKey: "onboarding.igdbDescription",
  },
] as const satisfies readonly OnboardingPage[];

/** `0`, not `-1`, for an unknown id: `nextPageId` then reads it as page 0
 * rather than indexing off the end of the tuple. */
export function pageIndex(selection: string): number {
  const index = ONBOARDING_PAGES.findIndex((page) => page.id === selection);

  return index === -1 ? 0 : index;
}

export function nextPageId(selection: string): string | undefined {
  const next = ONBOARDING_PAGES[pageIndex(selection) + 1];

  return next?.id;
}
