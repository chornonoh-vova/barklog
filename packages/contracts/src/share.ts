import * as v from "valibot";

import { integerFrom } from "./coerce.js";
import type { GameSummaryWire } from "./wire.js";

export const SHARE_URL_MAX = 2048;
export const IDENTIFY_LIMIT_DEFAULT = 15;
export const IDENTIFY_LIMIT_MAX = 20;

/**
 * Shape only. The outbound request is guarded at the network layer instead —
 * see `apps/api/src/share/safe-fetch.ts`.
 */
export function isShareableUrl(input: string): boolean {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "" && url.port !== "443") return false;

  return true;
}

/**
 * The sizing tokens an app build before the any-link release understands. That
 * build looks `provider` up in a two-entry table to size the source thumbnail
 * and reads `undefined` for anything else, which throws when the source has no
 * thumbnail. It never renders the value as text, so this is a shape hint, not
 * a claim about who published the page.
 */
export const LEGACY_SHARE_PROVIDERS = ["youtube", "tiktok"] as const;
export type LegacyShareProvider = (typeof LEGACY_SHARE_PROVIDERS)[number];

/**
 * Only the portrait token needs matching: `youtube` is the landscape one and
 * doubles as the fallback, so every host that is not TikTok wants it anyway.
 *
 * Exact hosts, never suffix matching — a loose match would hand `nottiktok.com`
 * and `tiktok.com.evil.test` the portrait box. This is no longer an outbound
 * allowlist (`safe-fetch.ts` guards that), so a miss costs an aspect ratio
 * rather than a fetch.
 */
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);

/**
 * Total, and never throwing: the old build crashes on any value outside the
 * pair, so there is no input for which returning nothing is safe. An arbitrary
 * page's Open Graph image is overwhelmingly landscape, which is what makes
 * `youtube` the right default rather than merely a convenient one.
 */
export function legacyShareProvider(pageUrl: string): LegacyShareProvider {
  let host: string;

  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return "youtube";
  }

  return TIKTOK_HOSTS.has(host) ? "tiktok" : "youtube";
}

export const shareIdentifySchema = v.strictObject({
  url: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(SHARE_URL_MAX),
    v.check((value) => isShareableUrl(value), "Only https links are supported"),
  ),
  limit: v.optional(integerFrom(1, IDENTIFY_LIMIT_MAX), IDENTIFY_LIMIT_DEFAULT),
});
export type ShareIdentifyBody = v.InferOutput<typeof shareIdentifySchema>;

export interface ShareSourceWire {
  /**
   * @deprecated A legacy thumbnail-sizing token, not the real provider — the
   * real one lives on the server's `SourceMeta`. Kept, and kept inside
   * `LEGACY_SHARE_PROVIDERS`, for as long as app builds predating the any-link
   * release are in the wild: those crash on any other value. New clients read
   * `thumbnailWidth`/`thumbnailHeight` for size and derive the display host
   * from `pageUrl`.
   */
  provider: LegacyShareProvider;
  shareId: string;
  title: string;
  author: string | null;
  /** The canonical source page, offered as the last resort when nothing could be identified. */
  pageUrl: string;
  /**
   * The source's cover image. `null` when the source gave nothing usable, or
   * gave something that is not an https url. A signed CDN url can expire
   * inside its cache TTL, so a load failure on the client is ordinary, not
   * exceptional.
   */
  thumbnailUrl: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
}

/** The tiers the extraction model chooses between. Drives its prompt and its schema. */
export const EXTRACTED_BASES = ["title", "author", "web", "none"] as const;

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
