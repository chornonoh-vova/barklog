import { normaliseShare, type NormalisedShare } from "./normalise.js";
import { fetchOembed, SourceGone, SourceUnavailable, type SourceMeta } from "./oembed.js";
import { fetchPage, parseOpenGraph } from "./opengraph.js";
import { matchProvider } from "./provider-match.js";
import type { LookupFn } from "./safe-fetch.js";
import { LADDER_BUDGET_MS } from "./safe-fetch.js";

/** We read the page and it carried no title. Terminal: retrying will not help. */
export class SourceUnreadable extends Error {
  override readonly name = "SourceUnreadable";
}

/**
 * The whole oEmbed rung, including whether it applies at all: `null` means
 * either no provider claims this url or the attempt failed in a way a later
 * rung may recover from. `SourceGone` is the exception — it is terminal, and
 * must not fall through to scraping the provider's own "unavailable" page.
 */
async function oembedRung(
  share: NormalisedShare,
  deadline: number,
  fetchImpl?: typeof fetch,
  lookup?: LookupFn,
): Promise<SourceMeta | null> {
  const match = matchProvider(share.url);
  if (match === null) return null;

  try {
    return {
      ...(await fetchOembed(match.endpoint, share.url, deadline, fetchImpl, lookup)),
      shareId: share.shareId,
      sourceId: share.sourceId,
    };
  } catch (error) {
    if (error instanceof SourceGone) throw error;
    return null;
  }
}

export async function fetchSourceMeta(
  share: NormalisedShare,
  fetchImpl?: typeof fetch,
  lookup?: LookupFn,
): Promise<SourceMeta> {
  const deadline = Date.now() + LADDER_BUDGET_MS;

  const direct = await oembedRung(share, deadline, fetchImpl, lookup);
  if (direct !== null) return direct;

  let page: { html: string; finalUrl: string };
  try {
    page = await fetchPage(share.url, deadline, fetchImpl, lookup);
  } catch (cause) {
    throw new SourceUnavailable("the page could not be read", { cause });
  }

  // Re-normalised, not reused: a short link's `finalUrl` is the only place
  // the real page (and its provider, if any) is known.
  const resolved = normaliseShare(page.finalUrl) ?? share;

  if (resolved.url !== share.url) {
    const afterRedirect = await oembedRung(resolved, deadline, fetchImpl, lookup);
    if (afterRedirect !== null) return afterRedirect;
  }

  const parsed = parseOpenGraph(page.html);
  if (parsed === null) throw new SourceUnreadable("the page carried no title");

  return {
    title: parsed.title,
    author: parsed.siteName,
    provider: new URL(resolved.url).hostname,
    pageUrl: resolved.url,
    shareId: resolved.shareId,
    sourceId: resolved.sourceId,
    thumbnailUrl: parsed.imageUrl,
    thumbnailWidth: parsed.imageWidth,
    thumbnailHeight: parsed.imageHeight,
  };
}
