import type { EmptyStateContent } from "@/components/empty-state";

/**
 * The copy lives here, imported as a type only, so this module keeps
 * react-native and @expo/ui out of its graph and stays testable in plain
 * Node — the same shape as `features/backlog/empty-states.ts`.
 */

/**
 * The payload resolved and carried no link: a shared image, or text with no
 * url in it. Distinct from still resolving, which is transient and gets a
 * spinner instead.
 */
export const NO_LINK: EmptyStateContent = {
  title: "No link in that share",
  systemImage: "link",
  description:
    "Barklog needs a YouTube or TikTok link. Share the video itself, not a screenshot of it.",
};

/**
 * Resolution itself failed: iOS never handed the payload over in a readable
 * form. Separate from `NO_LINK` because that copy's advice — share the video,
 * not a screenshot — is wrong when the share was fine and the read was not.
 */
export const UNREADABLE: EmptyStateContent = {
  title: "Could not read that share",
  systemImage: "exclamationmark.triangle",
  description: "Barklog could not open what was shared. Try sharing the video again.",
};

/** Reads as a sentence when the guesses are joined, not as a debug dump. */
export function noMatch(guesses: string[]): EmptyStateContent {
  return {
    title: "No match in the catalogue",
    systemImage: "magnifyingglass",
    description:
      guesses.length === 0
        ? "We could not tell which game this video is about."
        : `We think this is about ${guesses.join(" or ")}, but it is not in the catalogue yet.`,
  };
}
