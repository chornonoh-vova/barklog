import { isShareableUrl } from "@repo/contracts";

import { sha1 } from "../cache-keys.js";

export interface NormalisedShare {
  url: string;
  shareId: string;
  /** Provider-native video id, for the two hosts we rebuild by hand. Every other page gets null. */
  sourceId: string | null;
  /**
   * The IGDB game slug, when the link is an igdb.com game page. IGDB is the
   * mirror's own source, so this slug maps straight to a row — no fetch, no
   * model. `null` for every other host.
   */
  igdbSlug: string | null;
}

// `t`, `ref`, and `si` are deliberately not here: all three are short and
// generic enough that an arbitrary third-party page could use one to select
// content (`?si=42` vs `?si=43` as a size or session id), not just track a
// referrer, and collapsing two different pages onto one shareId serves one
// page's cached answer for another. YouTube/TikTok video pages are rebuilt
// from their id below, so this list never touches their usage of any of them.
const TRACKING = new Set([
  "fbclid",
  "gclid",
  "igsh",
  "mc_cid",
  "mc_eid",
  "is_from_webapp",
  "sender_device",
]);

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const YOUTUBE_ID = /^[\w-]{11}$/;

const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com"]);

const IGDB_HOSTS = new Set(["igdb.com", "www.igdb.com"]);
/** IGDB slugs are lowercase alphanumerics and hyphens. */
const IGDB_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const TIKTOK_ID = /^\d{6,25}$/;

function segments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

function youtubeId(url: URL): string | null {
  const parts = segments(url);

  if (url.hostname === "youtu.be") return parts[0] ?? null;
  if (parts[0] === "shorts" || parts[0] === "embed") return parts[1] ?? null;
  if (parts.length === 1 && parts[0] === "watch") return url.searchParams.get("v");

  return null;
}

function stripTracking(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (TRACKING.has(lower) || lower.startsWith("utm_")) url.searchParams.delete(key);
  }
  // Two spellings differing only in query-param order must hit the same cache entry.
  url.searchParams.sort();
}

function finish(
  url: string,
  sourceId: string | null,
  igdbSlug: string | null = null,
): NormalisedShare {
  return { url, shareId: sha1(url), sourceId, igdbSlug };
}

export function normaliseShare(input: string): NormalisedShare | null {
  if (!isShareableUrl(input)) return null;

  const url = new URL(input);
  url.hash = "";
  stripTracking(url);

  if (IGDB_HOSTS.has(url.hostname)) {
    const [section, slug] = segments(url);
    if (section === "games" && slug !== undefined && IGDB_SLUG.test(slug)) {
      return finish(`https://www.igdb.com/games/${slug}`, null, slug);
    }
  }

  if (YOUTUBE_HOSTS.has(url.hostname)) {
    const videoId = youtubeId(url);
    if (videoId !== null && YOUTUBE_ID.test(videoId)) {
      return finish(`https://www.youtube.com/watch?v=${videoId}`, videoId);
    }
    return finish(url.toString(), null);
  }

  if (TIKTOK_HOSTS.has(url.hostname)) {
    const [creator, kind, videoId] = segments(url);

    if (
      creator?.startsWith("@") === true &&
      kind === "video" &&
      videoId !== undefined &&
      TIKTOK_ID.test(videoId)
    ) {
      return finish(`https://www.tiktok.com/${creator}/video/${videoId}`, videoId);
    }
  }

  return finish(url.toString(), null);
}
