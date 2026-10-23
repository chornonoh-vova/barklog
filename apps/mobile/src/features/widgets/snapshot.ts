import { BACKLOG_STATUSES, type BacklogListItemWire, type BacklogStatus } from "@repo/contracts";
import type { SFSymbol } from "sf-symbols-typescript";

import { compare } from "@/features/backlog/order";
import { statusLabel, statusSymbol } from "@/features/game/format";
import { i18n } from "@/lib/i18n/instance";

import { WIDGET_APP_URL, widgetGameUrl, widgetSectionUrl } from "./links";

/*
 * No `null` anywhere: the native side stores props in UserDefaults, which
 * throws on NSNull. A missing cover or mascot is `""`, an unrated game is `0`.
 */
export interface WidgetGame {
  id: number;
  name: string;
  rating: number;
  cover: string;
  url: string;
}

export interface WidgetSection {
  title: string;
  symbol: SFSymbol;
  count: number;
  empty: string;
  url: string;
  games: WidgetGame[];
}

export interface WidgetSnapshot {
  signedIn: boolean;
  message: string;
  appUrl: string;
  mascot: string;
  sections: Record<BacklogStatus, WidgetSection>;
}

export const WIDGET_SHELF_SIZE = 4;

function shelves(items: BacklogListItemWire[]) {
  return Object.fromEntries(
    BACKLOG_STATUSES.map((status) => {
      const all = items.filter((item) => item.status === status);
      const kept = all.sort((a, b) => compare("updated_at", a, b)).slice(0, WIDGET_SHELF_SIZE);

      return [status, { count: all.length, kept }];
    }),
  ) as Record<BacklogStatus, { count: number; kept: BacklogListItemWire[] }>;
}

export function deriveSnapshot(
  items: BacklogListItemWire[],
  covers: Readonly<Record<string, string>>,
  mascot: string,
): WidgetSnapshot {
  const byStatus = shelves(items);
  const sections = Object.fromEntries(
    BACKLOG_STATUSES.map((status): [BacklogStatus, WidgetSection] => [
      status,
      {
        title: statusLabel(status).toLocaleUpperCase(i18n.language),
        symbol: statusSymbol(status),
        count: byStatus[status].count,
        empty: i18n.t(`backlog.emptyFilter.${status}.title`),
        url: widgetSectionUrl(status),
        games: byStatus[status].kept.map((item) => ({
          id: item.gameId,
          name: item.game.name,
          rating: item.rating ?? 0,
          cover: (item.game.coverImageId !== null && covers[item.game.coverImageId]) || "",
          url: widgetGameUrl(item.gameId),
        })),
      },
    ]),
  ) as Record<BacklogStatus, WidgetSection>;

  return { signedIn: true, message: "", appUrl: WIDGET_APP_URL, mascot, sections };
}

export function signedOutSnapshot(mascot: string): WidgetSnapshot {
  return {
    ...deriveSnapshot([], {}, mascot),
    signedIn: false,
    message: i18n.t("widget.signedOut"),
  };
}

/** Only the covers `deriveSnapshot` would show get downloaded. */
export function shelfCoverIds(items: BacklogListItemWire[]): string[] {
  const ids = Object.values(shelves(items)).flatMap(({ kept }) =>
    kept.flatMap((item) => (item.game.coverImageId === null ? [] : [item.game.coverImageId])),
  );

  return [...new Set(ids)];
}
