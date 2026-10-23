import { i18n } from "@/lib/i18n/instance";

/** The row's tiles and the viewer's pages must announce a shot the same way. */
export function screenshotLabel(index: number, total: number): string {
  return i18n.t("game.screenshotLabel", { index: index + 1, total });
}
