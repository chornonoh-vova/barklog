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
  /** The canonical video page, offered as the last resort when nothing could be identified. */
  pageUrl: string;
  /**
   * oEmbed's cover image. `null` when the provider omitted one or gave
   * something that is not an https url. TikTok's is a signed CDN url that can
   * expire inside `OEMBED_TTL_SECONDS`, so a load failure on the client is
   * ordinary, not exceptional.
   */
  thumbnailUrl: string | null;
}

/** The tiers the extraction model chooses between. Drives its prompt and its schema. */
export const EXTRACTED_BASES = ["title", "channel", "none"] as const;

/**
 * What the guesses were derived from, in descending confidence. `unavailable`
 * is the route's own fail-soft marker for an extraction that threw, where
 * `guesses` holds the raw video title rather than anything a model believed.
 */
export type ShareBasis = (typeof EXTRACTED_BASES)[number] | "unavailable";

export interface ShareIdentifyResponse {
  source: ShareSourceWire;
  /** Drives both the section header above the results and the empty-state copy. */
  basis: ShareBasis;
  /**
   * @deprecated Read `basis` instead. Kept for one release so an older app
   * build, which treats an absent field as `false`, does not show the fallback
   * notice on every result.
   */
  identified: boolean;
  /** What the extraction believed the game was called. Drives the empty-state copy. */
  guesses: string[];
  items: GameSummaryWire[];
}
