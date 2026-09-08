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

export async function fetchSourceMeta(
  share: NormalisedShare,
  fetchImpl?: typeof fetch,
  lookup?: LookupFn,
): Promise<SourceMeta> {
  const deadline = Date.now() + LADDER_BUDGET_MS;

  const direct = matchProvider(share.url);
  if (direct !== null) {
    try {
      return {
        ...(await fetchOembed(direct.endpoint, share.url, deadline, fetchImpl, lookup)),
        shareId: share.shareId,
      };
    } catch (error) {
      // Gone is terminal and must not fall through to scraping the
      // provider's own "unavailable" page. Anything else may still resolve
      // on a later rung.
      if (error instanceof SourceGone) throw error;
    }
  }

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
    const afterRedirect = matchProvider(resolved.url);
    if (afterRedirect !== null) {
      try {
        return {
          ...(await fetchOembed(afterRedirect.endpoint, resolved.url, deadline, fetchImpl, lookup)),
          shareId: resolved.shareId,
        };
      } catch (error) {
        if (error instanceof SourceGone) throw error;
      }
    }
  }

  const parsed = parseOpenGraph(page.html);
  if (parsed === null) throw new SourceUnreadable("the page carried no title");

  return {
    title: parsed.title,
    author: parsed.siteName,
    provider: new URL(resolved.url).hostname,
    pageUrl: resolved.url,
    shareId: resolved.shareId,
    thumbnailUrl: parsed.imageUrl,
    thumbnailWidth: parsed.imageWidth,
    thumbnailHeight: parsed.imageHeight,
  };
}
