import type { SFSymbol } from "sf-symbols-typescript";

/** No react-native or @expo/ui anywhere in this module's graph, so the copy is
 * testable in plain Node. */
export interface OnboardingPage {
  id: string;
  systemImage: SFSymbol;
  title: string;
  description: string;
}

export const IGDB_PAGE_ID = "igdb";

/** `as const satisfies`, not an annotation: the tuple keeps its literal length,
 * which is what lets a caller index `[0]` without a non-null assertion. */
export const ONBOARDING_PAGES = [
  {
    id: "welcome",
    systemImage: "pawprint.fill",
    title: "Welcome to Barklog",
    description:
      "Barklog holds the games you're playing and the ones you keep meaning to start.",
  },
  {
    id: "backlog",
    systemImage: "checklist",
    title: "Managing your game backlog",
    description:
      "Add a game, then mark it waiting, playing, completed, or abandoned. Abandoned is a real answer.",
  },
  {
    id: "explore",
    systemImage: "sparkle.magnifyingglass",
    title: "Exploring games",
    description:
      "See what's popular, what's coming out, and what just landed. Or search by name if you already know what you want.",
  },
  {
    id: IGDB_PAGE_ID,
    systemImage: "books.vertical.fill",
    title: "All game data is powered by IGDB",
    description:
      "Every cover, release date, platform, and summary in Barklog comes from IGDB, a games database its community maintains.",
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
