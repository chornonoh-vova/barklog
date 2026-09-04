import type { ImageRequireSource } from "react-native";

/**
 * The mascot art, keyed by name so `empty-states.ts` and `pages.ts` can name an
 * illustration without pulling react-native — or a webp — into their graph:
 * they import this as a type, which erases at compile, and stay testable in
 * plain Node.
 */
export type IllustrationName = "default" | "backlog" | "explore" | "share";

export const SYMBOL_SIZE = 64;

/** `require`, not a static import: nothing declares an ambient `*.webp` module,
 * and `no-require-imports` is off in the shared Expo eslint config for exactly
 * this. Metro resolves `@/assets/*` from the tsconfig path. */
export const ILLUSTRATIONS: Record<IllustrationName, ImageRequireSource> = {
  default: require("@/assets/illustrations/barklog-mascot-default.webp"),
  backlog: require("@/assets/illustrations/barklog-mascot-backlog.webp"),
  explore: require("@/assets/illustrations/barklog-mascot-explore.webp"),
  share: require("@/assets/illustrations/barklog-mascot-share.webp"),
};
