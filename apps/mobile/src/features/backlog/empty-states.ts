import type { BacklogStatus } from "@repo/contracts";
import type { SFSymbol } from "sf-symbols-typescript";

export interface EmptyState {
  title: string;
  systemImage: SFSymbol;
  description: string;
}

/**
 * Two empty states, because they mean different things.
 *
 * An empty backlog is an onboarding moment and gets a call to action. A filter
 * that happens to match nothing is not — the user knows what they did, and the
 * filter itself is the way out, so a button pointing elsewhere would be noise.
 */
export const EMPTY_BACKLOG: EmptyState = {
  title: "Your backlog is empty",
  systemImage: "gamecontroller",
  description:
    "Add the games you own and Barklog will keep track of what you're playing, what's up next, and what you've finally finished.",
};

export const EMPTY_FILTER: Record<BacklogStatus, EmptyState> = {
  waiting: {
    title: "Nothing waiting",
    systemImage: "clock",
    description: "Games you plan to get to will show up here.",
  },
  playing: {
    title: "Nothing in progress",
    systemImage: "gamecontroller",
    description: "Mark a game as Playing and it will show up here.",
  },
  completed: {
    title: "Nothing finished yet",
    systemImage: "checkmark.seal",
    description: "Games you see through to the end will show up here.",
  },
  abandoned: {
    title: "Nothing abandoned",
    systemImage: "xmark.bin",
    description: "Games you give up on will show up here. No judgement.",
  },
};
