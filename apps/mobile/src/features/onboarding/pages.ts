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
 * The third page's three items paraphrase the `SHELVES` feeds in
 * `features/explore/shelves.ts`.
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

/**
 * `0` for an unknown `selection`, not `-1`: `nextPageId` then treats it as page
 * 0, so the button reads "Continue" rather than "Start" instead of indexing off
 * the end of the tuple.
 */
export function pageIndex(selection: string): number {
  const index = ONBOARDING_PAGES.findIndex((page) => page.id === selection);

  return index === -1 ? 0 : index;
}

/**
 * `undefined` on the last page is the whole signal: it is what tells the
 * caller to complete instead of advance, so there is no separate `isLast`
 * needed to drive that decision.
 */
export function nextPageId(selection: string): string | undefined {
  // `noUncheckedIndexedAccess` makes this `OnboardingPage | undefined` already;
  // no assertion needed to read past the end of the tuple.
  const next = ONBOARDING_PAGES[pageIndex(selection) + 1];

  return next?.id;
}
