import type { BacklogStatus } from "@repo/contracts";

import type { EmptyStateContent } from "@/components/empty-state";
import { statusSymbol } from "@/features/game/format";

export const EMPTY_BACKLOG: EmptyStateContent = {
  title: "Your backlog is empty",
  systemImage: "gamecontroller",
  illustration: "backlog",
  description: "Add the games you own, and what you're playing stays at the top.",
};

export const EMPTY_FILTER: Record<BacklogStatus, EmptyStateContent> = {
  waiting: {
    title: "Nothing waiting",
    systemImage: statusSymbol("waiting"),
    illustration: "backlog",
    description: "Games you mean to play, but haven't started.",
  },
  playing: {
    title: "Nothing in progress",
    systemImage: statusSymbol("playing"),
    illustration: "backlog",
    description: "Games you're in the middle of.",
  },
  completed: {
    title: "Nothing finished yet",
    systemImage: statusSymbol("completed"),
    illustration: "backlog",
    description: "Games you saw all the way through.",
  },
  abandoned: {
    title: "Nothing abandoned",
    systemImage: statusSymbol("abandoned"),
    illustration: "backlog",
    description: "Games you gave up on. No judgement.",
  },
};
