import { normaliseShare, type NormalisedShare } from "./normalise.js";
import { fetchOembed, SourceGone, SourceUnavailable, type SourceMeta } from "./oembed.js";
import { fetchPage, parseOpenGraph } from "./opengraph.js";
import { matchProvider } from "./provider-match.js";
import type { LookupFn } from "./safe-fetch.js";
import { LADDER_BUDGET_MS } from "./safe-fetch.js";

/**
 * The site refused us outright — a bot challenge, or auth. Terminal: the page
 * may well exist, but no retry of ours will see it. Distinct from
 * `SourceUnreadable`, which means we DID read a page and it carried no title.
 */
export class SourceBlocked extends Error {
  override readonly name = "SourceBlocked";
}

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

  let page: { html: string; finalUrl: string; status: number };
  try {
    page = await fetchPage(share.url, deadline, fetchImpl, lookup);
  } catch (cause) {
    throw new SourceUnavailable("the page could not be read", { cause });
  }

  // A non-2xx body is empty by the time it reaches here, so parsing it would
  // report "no title" for a page we never actually received. What the status
  // meant has to be decided before the parse, not after it.
  if (page.status === 401 || page.status === 403) {
    throw new SourceBlocked(`the site answered ${page.status}`);
  }
  if (page.status === 404 || page.status === 410) {
    throw new SourceGone(`the page answered ${page.status}`);
  }
  if (page.status < 200 || page.status >= 300) {
    throw new SourceUnavailable(`the page answered ${page.status}`);
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
