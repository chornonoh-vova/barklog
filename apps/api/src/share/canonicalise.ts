import { shareHostProvider, type ShareProviderName } from "@repo/contracts";

export interface VideoRef {
  provider: ShareProviderName;
  videoId: string;
  /** The canonical page URL, which is what an oEmbed endpoint is asked about. */
  pageUrl: string;
}

export type Canonical =
  { kind: "video"; ref: VideoRef } | { kind: "shortLink"; url: string } | { kind: "unsupported" };

const UNSUPPORTED: Canonical = { kind: "unsupported" };

const YOUTUBE_ID = /^[\w-]{11}$/;
const TIKTOK_ID = /^\d{6,25}$/;
const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

/** Three hops is generous for a link shortener and short enough to bound a loop. */
export const MAX_REDIRECTS = 3;

function youtubeId(url: URL): string | null {
  const segments = url.pathname.split("/").filter((segment) => segment !== "");

  if (url.hostname.toLowerCase() === "youtu.be") return segments[0] ?? null;
  if (segments[0] === "shorts") return segments[1] ?? null;
  if (url.pathname === "/watch") return url.searchParams.get("v");

  return null;
}

/**
 * Pure. Returns `shortLink` — rather than resolving it — so the only network
 * call lives in `resolveShortLink`, where the per-hop host check is.
 */
export function parseShareUrl(input: string): Canonical {
  const provider = shareHostProvider(input);
  if (provider === null) return UNSUPPORTED;

  const url = new URL(input);
  const host = url.hostname.toLowerCase();

  if (provider === "youtube") {
    const videoId = youtubeId(url);
    if (videoId === null || !YOUTUBE_ID.test(videoId)) return UNSUPPORTED;

    // Rebuilt, not passed through: this drops `t`, `si` and every other
    // tracking parameter, so two shares of the same video hit the same cache key.
    return {
      kind: "video",
      ref: {
        provider,
        videoId,
        pageUrl: `https://www.youtube.com/watch?v=${videoId}`,
      },
    };
  }

  const segments = url.pathname.split("/").filter((segment) => segment !== "");

  if (TIKTOK_SHORT_HOSTS.has(host) || segments[0] === "t") {
    return { kind: "shortLink", url: input };
  }

  // `/@creator/video/:id`. The creator segment is kept: TikTok's oEmbed is
  // asked about the page, not the id.
  const [creator, kind, videoId] = segments;
  if (creator?.startsWith("@") !== true || kind !== "video" || videoId === undefined) {
    return UNSUPPORTED;
  }
  if (!TIKTOK_ID.test(videoId)) return UNSUPPORTED;

  return {
    kind: "video",
    ref: {
      provider,
      videoId,
      pageUrl: `https://www.tiktok.com/${creator}/video/${videoId}`,
    },
  };
}

/**
 * The only place Barklog fetches a user-supplied URL, and therefore the whole
 * SSRF surface. Three constraints, all of them load-bearing:
 *
 *  - every hop's host must pass `shareHostProvider`, which is an exact-match
 *    allowlist and https-only, so a redirect cannot walk off TikTok or downgrade;
 *  - `redirect: "manual"`, so undici never follows a hop we have not checked;
 *  - at most `MAX_REDIRECTS` hops, so a shortener loop terminates.
 */
export async function resolveShortLink(url: string, fetchImpl: typeof fetch): Promise<Canonical> {
  let current = url;

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    // Before the fetch, every time — including the caller's own URL.
    if (shareHostProvider(current) === null) return UNSUPPORTED;

    const response = await fetchImpl(current, { method: "GET", redirect: "manual" });
    const location = response.headers.get("location");
    if (location === null) return UNSUPPORTED;

    current = new URL(location, current).toString();

    const parsed = parseShareUrl(current);
    if (parsed.kind !== "shortLink") return parsed;
  }

  return UNSUPPORTED;
}
