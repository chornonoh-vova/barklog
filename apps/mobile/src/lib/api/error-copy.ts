import { i18n } from "@/lib/i18n/instance";

import { isApiError } from "./errors";

export function errorCopy(error: unknown): { title: string; description: string } {
  if (!isApiError(error)) {
    return {
      title: i18n.t("errors.genericTitle"),
      description: i18n.t("errors.genericDescription"),
    };
  }

  if (error.status === 0) {
    return {
      title: i18n.t("errors.offlineTitle"),
      description: i18n.t("errors.offlineDescription"),
    };
  }

  // Before the status branches: a coded problem has copy written for its cause.
  if (error.code !== undefined) {
    return {
      title: i18n.t(`apiErrors.${error.code}.title`),
      // `count` picks the plural for `backlog_cap_reached`; other copy ignores it.
      description: i18n.t(`apiErrors.${error.code}.description`, { count: error.toFree ?? 1 }),
    };
  }

  if (error.status === 429) {
    return {
      title: i18n.t("errors.rateLimitedTitle"),
      description: i18n.t("errors.rateLimitedDescription"),
    };
  }

  if (error.status >= 500) {
    return { title: i18n.t("errors.serverTitle"), description: i18n.t("errors.serverDescription") };
  }

  // Server copy, English only: a problem without a code is not one the app expects to show.
  return { title: error.title, description: error.detail ?? i18n.t("errors.genericDescription") };
}
