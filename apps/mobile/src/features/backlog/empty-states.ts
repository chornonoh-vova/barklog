import type { BacklogStatus } from "@repo/contracts";

import type { EmptyStateContent } from "@/components/empty-state";
import { statusSymbol } from "@/features/game/format";
import { i18n } from "@/lib/i18n/instance";

/** Functions, not constants: the copy is read at render, after i18n is set up. */
export function emptyBacklog(): EmptyStateContent {
  return {
    title: i18n.t("backlog.empty.title"),
    systemImage: "gamecontroller",
    illustration: "backlog",
    description: i18n.t("backlog.empty.description"),
  };
}

export function emptyFilter(status: BacklogStatus): EmptyStateContent {
  return {
    title: i18n.t(`backlog.emptyFilter.${status}.title`),
    systemImage: statusSymbol(status),
    illustration: "backlog",
    description: i18n.t(`backlog.emptyFilter.${status}.description`),
  };
}
