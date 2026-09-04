import type { ShareBasis } from "@repo/contracts";

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

/**
 * Shown above the results on the `unavailable` basis only: extraction itself
 * failed, so the matches come from searching the video's raw title instead.
 */
export const UNAVAILABLE_NOTICE =
  "We couldn't tell which game this is, so these are matches for the video title instead.";

/**
 * Reads as a sentence when the guesses are joined, not as a debug dump.
 *
 * `basis` gates which sentence is used, not just `guesses.length`: on the
 * `unavailable` path `guesses` holds the video's raw title, not a game title,
 * so quoting it back as "we think this is about ..." would assert a belief the
 * server explicitly disclaimed. `none` is the model's own dead end — it had
 * the channel to go on and still could not tell — so it says so and leaves the
 * original video as the way out.
 */
export function noMatch(basis: ShareBasis, guesses: string[]): EmptyStateContent {
  return {
    title: "No match in the catalogue",
    systemImage: "magnifyingglass",
    description:
      basis === "none"
        ? "We could not tell which game this is, even from the channel. Open the original video to check."
        : basis === "unavailable" || guesses.length === 0
          ? "We could not tell which game this video is about."
          : `We think this is about ${guesses.join(" or ")}, but it is not in the catalogue yet.`,
  };
}
