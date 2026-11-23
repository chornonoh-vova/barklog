import { i18n } from "@/lib/i18n/instance";

export const FEEDBACK_EMAIL = "chernonog.vova+barklog@gmail.com";

/** English on purpose: it is for the developer's inbox. */
export const FEEDBACK_SUBJECT = "Feedback About Barklog";

export type DebugInfo = {
  version: string | null;
  build: string | null;
  /** `null` only in development or with updates disabled. */
  updateId: string | null;
  isEmbeddedLaunch: boolean;
  channel: string | null;
  osVersion: string;
  isPad: boolean;
  language: string;
  userId: string | null;
  premium: boolean | undefined;
};

/** Labels stay in English for the developer; only the line asking to keep them is translated. */
export function feedbackBody(info: DebugInfo): string {
  const app = [info.version ?? "unknown", info.build ? `(${info.build})` : null]
    .filter(Boolean)
    .join(" ");
  const update =
    info.updateId === null
      ? "none (development)"
      : info.isEmbeddedLaunch
        ? `embedded, ${info.updateId}`
        : info.updateId;
  const premium = info.premium === undefined ? "unknown" : info.premium ? "yes" : "no";

  return [
    "",
    "",
    "",
    "—",
    i18n.t("feedback.detailsIntro"),
    `App: Barklog ${app}`,
    `Update: ${update}${info.channel ? ` (${info.channel})` : ""}`,
    `Device: ${info.isPad ? "iPad" : "iPhone"}, iOS ${info.osVersion}`,
    `Language: ${info.language}`,
    `Account: ${info.userId ?? "signed out"}`,
    `Premium: ${premium}`,
  ].join("\n");
}

/**
 * RFC 6068: `encodeURIComponent`, not `URLSearchParams` (mail apps show its `+`
 * for spaces literally), only the address's local part encoded, CRLF line breaks.
 */
export function feedbackMailto(body: string): string {
  const [local, domain] = FEEDBACK_EMAIL.split("@");
  const subject = encodeURIComponent(FEEDBACK_SUBJECT);
  const text = encodeURIComponent(body.replace(/\r?\n/g, "\r\n"));
  return `mailto:${encodeURIComponent(local!)}@${domain}?subject=${subject}&body=${text}`;
}
