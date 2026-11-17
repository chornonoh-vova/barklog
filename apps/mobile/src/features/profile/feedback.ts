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

/** The `mailto:` fallback for a device without Mail set up. */
export function feedbackMailto(body: string): string {
  const query = new URLSearchParams({ subject: FEEDBACK_SUBJECT, body });
  // `URLSearchParams` writes spaces as `+`, which mail apps show literally,
  // and RFC 6068 asks for CRLF line breaks. The `+` in the address is encoded
  // too, for clients that read it as a space.
  const params = query.toString().replace(/\+/g, "%20").replace(/%0A/g, "%0D%0A");
  return `mailto:${FEEDBACK_EMAIL.replace("+", "%2B")}?${params}`;
}
