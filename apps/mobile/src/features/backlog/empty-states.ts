import type { BacklogStatus } from "@repo/contracts";

// Type-only, so Vitest can import the copy without `@expo/ui`.
import type { EmptyStateContent } from "@/components/empty-state";
import { statusSymbol } from "@/features/game/format";

/**
 * An empty backlog is an onboarding moment and gets a call to action. A filter
 * matching nothing is not — the filter itself is the way out, so a button
 * pointing elsewhere would be noise.
 */
export const EMPTY_BACKLOG: EmptyStateContent = {
  title: "Your backlog is empty",
  systemImage: "gamecontroller",
  description: "Add the games you own, and what you're playing stays at the top.",
};

/** Symbols come from `statusSymbol`, so only the copy lives here. */
export const EMPTY_FILTER: Record<BacklogStatus, EmptyStateContent> = {
  waiting: {
    title: "Nothing waiting",
    systemImage: statusSymbol("waiting"),
    description: "Games you mean to play, but haven't started.",
  },
  playing: {
    title: "Nothing in progress",
    systemImage: statusSymbol("playing"),
    description: "Games you're in the middle of.",
  },
  completed: {
    title: "Nothing finished yet",
    systemImage: statusSymbol("completed"),
    description: "Games you saw all the way through.",
  },
  abandoned: {
    title: "Nothing abandoned",
    systemImage: statusSymbol("abandoned"),
    description: "Games you gave up on. No judgement.",
  },
};
