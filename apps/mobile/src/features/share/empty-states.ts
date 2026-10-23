import type { ShareBasis } from "@repo/contracts";

import type { EmptyStateContent } from "@/components/empty-state";
import { i18n } from "@/lib/i18n/instance";

/**
 * The copy lives here, imported as a type only, so this module keeps
 * react-native and @expo/ui out of its graph and stays testable in plain
 * Node — the same shape as `features/backlog/empty-states.ts`. Functions, not
 * constants, so the copy is read at render, after i18n is set up.
 */

/**
 * The payload resolved and carried no link: a shared image, or text with no
 * url in it. Distinct from still resolving, which is transient and gets a
 * spinner instead.
 */
export function noLink(): EmptyStateContent {
  return {
    title: i18n.t("share.noLinkTitle"),
    systemImage: "link",
    illustration: "share",
    description: i18n.t("share.noLinkDescription"),
  };
}

/**
 * Resolution itself failed: iOS never handed the payload over in a readable
 * form. Separate from `noLink` because that copy's advice — share the video,
 * not a screenshot — is wrong when the share was fine and the read was not.
 */
export function unreadable(): EmptyStateContent {
  return {
    title: i18n.t("share.unreadableTitle"),
    systemImage: "exclamationmark.triangle",
    illustration: "share",
    description: i18n.t("share.unreadableDescription"),
  };
}

/**
 * Reads as a sentence when the guesses are joined, not as a debug dump.
 *
 * `basis` gates which sentence is used, not just `guesses.length`: on the
 * `unavailable` path `guesses` holds the source's raw title, not a game title,
 * so quoting it back as "we think this is about ..." would assert a belief the
 * server explicitly disclaimed. `none` is the model's own dead end — it had
 * the title, the author, and a web search to go on and still could not tell —
 * so it says so and leaves the original page as the way out.
 */
export function noMatch(basis: ShareBasis, guesses: string[]): EmptyStateContent {
  return {
    title: i18n.t("share.noMatchTitle"),
    systemImage: "magnifyingglass",
    illustration: "share",
    description:
      basis === "none"
        ? i18n.t("share.noMatchNone")
        : basis === "unavailable" || guesses.length === 0
          ? i18n.t("share.noMatchUnknown")
          : // Joined by hand, not i18next's `list` formatter: that needs
            // `Intl.ListFormat`, which Hermes does not ship.
            i18n.t("share.noMatchGuesses", { guesses: guesses.join(i18n.t("common.or")) }),
  };
}
