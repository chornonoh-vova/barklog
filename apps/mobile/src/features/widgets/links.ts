import type { BacklogStatus } from "@repo/contracts";

import { parseStatusParam } from "@/features/backlog/status-param";

/** Widget taps get their own host and are mapped into the Home stack by name:
 * Explore and Search each have a `game/[id]` of their own. */
const BASE = "barklog://widget";

const HOME = "/(tabs)/(home)";

export const WIDGET_APP_URL = `${BASE}/home`;

export function widgetGameUrl(id: number): string {
  return `${BASE}/game/${id}`;
}

export function widgetSectionUrl(status: BacklogStatus): string {
  return `${BASE}/home/${status}`;
}

/** The route a widget url opens, or `null` for a url the widget did not make.
 * iOS hands the tap over as `barklog:///widget/...`, so both spellings count. */
export function widgetRoute(url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean);
  if (url.hostname !== "widget") {
    if (url.hostname !== "" || segments[0] !== "widget") return null;

    segments.shift();
  }

  const [kind, value] = segments;
  const status = parseStatusParam(value);
  if (kind === "game" && value !== undefined && /^\d+$/.test(value)) return `${HOME}/game/${value}`;
  if (kind === "home" && status !== undefined) return `${HOME}?status=${status}`;

  return HOME;
}
