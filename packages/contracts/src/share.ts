import * as v from "valibot";

import { integerFrom } from "./coerce.js";
import type { GameSummaryWire } from "./wire.js";

export const SHARE_PROVIDERS = ["youtube", "tiktok"] as const;
export type ShareProviderName = (typeof SHARE_PROVIDERS)[number];

export const SHARE_URL_MAX = 2048;
export const IDENTIFY_LIMIT_DEFAULT = 15;
export const IDENTIFY_LIMIT_MAX = 20;

/**
 * Exact hosts, never suffix matching: `endsWith("youtube.com")` would accept
 * `notyoutube.com`, and a suffix check on `.youtube.com` would accept
 * `youtube.com.evil.test`. This list is the API's outbound allowlist, so a
 * loose match here is an SSRF hole.
 */
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);

/** `null` for anything we will not fetch — wrong host, wrong scheme, unparseable. */
export function shareHostProvider(url: string): ShareProviderName | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // https only: the redirect chain in `canonicalise.ts` re-checks every hop
  // through this function, so a downgrade to http is refused there too.
  if (parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) return "youtube";
  if (TIKTOK_HOSTS.has(host)) return "tiktok";

  return null;
}

export const shareIdentifySchema = v.strictObject({
  url: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(SHARE_URL_MAX),
    v.check(
      (value) => shareHostProvider(value) !== null,
      "Only https links to YouTube or TikTok are supported",
    ),
  ),
  limit: v.optional(integerFrom(1, IDENTIFY_LIMIT_MAX), IDENTIFY_LIMIT_DEFAULT),
});
export type ShareIdentifyBody = v.InferOutput<typeof shareIdentifySchema>;

export interface ShareSourceWire {
  provider: ShareProviderName;
  videoId: string;
  title: string;
  author: string | null;
}

export interface ShareIdentifyResponse {
  source: ShareSourceWire;
  /** What the extraction believed the game was called. Drives the empty-state copy. */
  guesses: string[];
  items: GameSummaryWire[];
}
