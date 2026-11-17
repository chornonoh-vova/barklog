import {
  BACKLOG_STATUSES,
  RATING_MAX,
  type BacklogListItemWire,
  type BacklogStatus,
} from "@repo/contracts";
import type { SFSymbol } from "sf-symbols-typescript";

import { countStatus } from "@/features/backlog/slots";
import { statusLabel } from "@/features/game/format";
import type { TileColor } from "@/features/profile/settings-icon";
import { formatLocale, i18n } from "@/lib/i18n/instance";

export type BacklogStats = {
  total: number;
  counts: Record<BacklogStatus, number>;
  averageRating: number | null;
  /** How many games the average is from. */
  ratedCount: number;
};

/** Derived from the one backlog list query (ADR-0003), never fetched. */
export function backlogStats(items: readonly BacklogListItemWire[]): BacklogStats {
  const counts = Object.fromEntries(
    BACKLOG_STATUSES.map((status) => [status, countStatus(items, status)]),
  ) as Record<BacklogStatus, number>;
  const ratings = items.flatMap((item) => (item.rating === null ? [] : [item.rating]));

  return {
    total: items.length,
    counts,
    averageRating:
      ratings.length === 0 ? null : ratings.reduce((sum, r) => sum + r, 0) / ratings.length,
    ratedCount: ratings.length,
  };
}

const gamesCount = (count: number) => i18n.t("game.gamesCount", { count });

/** "Stats · 42 games" — the section header. */
export function statsTitle(total: number): string {
  return `${i18n.t("profile.stats.title")} · ${gamesCount(total)}`;
}

/** The filled variant of Home's status symbols, on a Settings tile. */
const STATUS_TILES: Record<BacklogStatus, { icon: SFSymbol; color: TileColor }> = {
  waiting: { icon: "clock.fill", color: "systemGray" },
  playing: { icon: "gamecontroller.fill", color: "systemBlue" },
  completed: { icon: "checkmark.seal.fill", color: "systemGreen" },
  abandoned: { icon: "xmark.bin.fill", color: "systemBrown" },
};

export type StatusStatsRow = {
  status: BacklogStatus;
  title: string;
  value: string;
  accessibilityLabel: string;
  icon: SFSymbol;
  color: TileColor;
};

export function statusRows(stats: BacklogStats): StatusStatsRow[] {
  const number = new Intl.NumberFormat(formatLocale());

  return BACKLOG_STATUSES.map((status) => {
    const count = stats.counts[status];
    const title = statusLabel(status);

    return {
      status,
      title,
      value: number.format(count),
      accessibilityLabel: `${title}, ${gamesCount(count)}`,
      ...STATUS_TILES[status],
    };
  });
}

/** Your own ratings, out of `RATING_MAX`, to one decimal, with how many games
 * that is from. The row's tile already shows a star, so the value does not. */
export function averageRatingRow(
  stats: Pick<BacklogStats, "averageRating" | "ratedCount">,
): { title: string; value: string; subtitle: string; accessibilityLabel: string } | null {
  if (stats.averageRating === null) return null;

  const rating = new Intl.NumberFormat(formatLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(stats.averageRating);
  const subtitle = i18n.t("profile.stats.ratedGames", { count: stats.ratedCount });
  const spoken = i18n.t("profile.stats.averageRatingSpoken", { rating, max: RATING_MAX });

  return {
    title: i18n.t("profile.stats.averageRating"),
    value: rating,
    subtitle,
    accessibilityLabel: `${spoken}, ${subtitle}`,
  };
}
