import { shareHostProvider, type ShareProviderName } from "@repo/contracts";

export interface VideoRef {
  provider: ShareProviderName;
  videoId: string;
  /** The canonical page URL, which is what an oEmbed endpoint is asked about. */
  pageUrl: string;
}

export type Canonical =
  | { kind: "video"; ref: VideoRef }
  | { kind: "shortLink"; url: string }
  | { kind: "unsupported" }
  | { kind: "unreachable" };

const UNSUPPORTED: Canonical = { kind: "unsupported" };

const YOUTUBE_ID = /^[\w-]{11}$/;
const TIKTOK_ID = /^\d{6,25}$/;
const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

/** Three hops is generous for a link shortener and short enough to bound a loop. */
export const MAX_REDIRECTS = 3;

/**
 * This is the SSRF-facing fetch — the target host is only allowlisted, not
 * trusted — so a shortener that accepts the connection and stalls must not be
 * allowed to hold the request open for undici's ~300s default.
 */
export const SHORT_LINK_TIMEOUT_MS = 5_000;

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

function youtubeId(url: URL): string | null {
  const segments = pathSegments(url);

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

  const segments = pathSegments(url);

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
 *
 * A network failure or the timeout firing is retriable and resolves to
 * `unreachable`, not `unsupported` — the shortener merely failed to answer,
 * which says nothing about whether the link is valid. A hostile or
 * off-allowlist redirect stays `unsupported`, since that is genuinely
 * terminal: an unparseable `Location`, a non-redirect status, or a redirect
 * off the allowlist are all caught and mapped there rather than left to
 * escape as a raw throw.
 */
export async function resolveShortLink(url: string, fetchImpl: typeof fetch): Promise<Canonical> {
  let current = url;

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    // Before the fetch, every time — including the caller's own URL.
    if (shareHostProvider(current) === null) return UNSUPPORTED;

    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(SHORT_LINK_TIMEOUT_MS),
      });
    } catch {
      // Network failure or the timeout signal firing — both retriable.
      return { kind: "unreachable" };
    }

    // Only the `Location` header is read below; release the body under
    // undici's pooling rather than leaving it for GC.
    void response.body?.cancel().catch(() => {});

    if (response.status < 300 || response.status >= 400) return UNSUPPORTED;

    const location = response.headers.get("location");
    if (location === null) return UNSUPPORTED;

    try {
      current = new URL(location, current).toString();
    } catch {
      return UNSUPPORTED;
    }

    const parsed = parseShareUrl(current);
    if (parsed.kind !== "shortLink") return parsed;
  }

  return UNSUPPORTED;
}
