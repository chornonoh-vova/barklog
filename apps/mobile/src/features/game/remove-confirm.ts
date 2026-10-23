import { i18n } from "@/lib/i18n/instance";

/** Removal discards the status and the rating, and there is no undo. */
export function removeConfirmCopy(name: string) {
  return {
    title: i18n.t("game.removeTitle", { name }),
    message: i18n.t("game.removeMessage"),
    confirm: i18n.t("game.removeConfirm"),
    cancel: i18n.t("common.cancel"),
  };
}
