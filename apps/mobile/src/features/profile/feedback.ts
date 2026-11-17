import { i18n } from "@/lib/i18n/instance";

export const FEEDBACK_EMAIL = "chernonog.vova+barklog@gmail.com";

/** Fixed in English: it is for the developer's inbox, not for the user. */
export const FEEDBACK_SUBJECT = "Feedback About Barklog";

export type DebugInfo = {
  version: string | null;
  build: string | null;
  /** `expo-updates`' id of whatever is running, the embedded bundle included;
   * `null` only in development or with updates disabled. */
  updateId: string | null;
  /** Whether the running JS is the bundle shipped inside the binary. */
  isEmbeddedLaunch: boolean;
  channel: string | null;
  osVersion: string;
  isPad: boolean;
  language: string;
  userId: string | null;
  premium: boolean | undefined;
};

/**
 * The email body: empty space on top for the user to write in, then the
 * details that help reproduce a report. Labels stay in English for the
 * developer; only the line asking the user to keep them is translated. Every
 * value is visible and editable before sending.
 */
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
 * The `mailto:` fallback for a device without Mail set up. Each part is
 * percent-encoded with `encodeURIComponent`, as RFC 6068 expects: not
 * `URLSearchParams`, whose form encoding turns spaces into `+`, which mail
 * apps show literally. Only the address's local part is encoded, so its `+`
 * becomes `%2B` and the `@` stays readable. Line breaks are CRLF, per the RFC.
 */
export function feedbackMailto(body: string): string {
  const [local, domain] = FEEDBACK_EMAIL.split("@");
  const subject = encodeURIComponent(FEEDBACK_SUBJECT);
  const text = encodeURIComponent(body.replace(/\r?\n/g, "\r\n"));
  return `mailto:${encodeURIComponent(local!)}@${domain}?subject=${subject}&body=${text}`;
}
