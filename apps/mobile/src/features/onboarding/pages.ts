import type { SFSymbol } from "sf-symbols-typescript";

/**
 * Copy in its own module, with no react-native or @expo/ui import anywhere in
 * its graph, so `test/onboarding-pages.test.ts` can check it against
 * `BACKLOG_STATUSES` in plain Node. `SFSymbol` is a type, so it erases.
 */
export interface OnboardingPage {
  /** Also the `TabView.Tab` value, so it must be stable and unique. */
  id: string;
  systemImage: SFSymbol;
  title: string;
  description: string;
}

/** The page that carries the igdb.com link and the final "Start" button. */
export const IGDB_PAGE_ID = "igdb";

/**
 * `as const satisfies` rather than a plain annotation: the tuple keeps its
 * literal length, which is what lets `onboarding-screen.tsx` index `[0]` for its
 * initial selection without a non-null assertion.
 *
 * Titles are the repo owner's wording. The third page's three items are the
 * three `SHELVES` feeds in `features/explore/shelves.ts`, paraphrased.
 */
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
