# Share Any Link

**Status:** Implemented reference, reconciled with code on 2026-10-29. Supersedes the video-only and source-preview designs.

[ADR-0007](../../adr/0007-staged-share-identification.md) records the durable decision. Domain terms are defined in [CONTEXT.md](../../../CONTEXT.md). This document describes the implemented behavior; it is not a pending implementation plan.

## Purpose and boundaries

An iOS share opens a list of possible games. The user chooses a candidate and uses the ordinary game detail controls to add it to their backlog. Identification itself never writes a backlog entry. HTTPS articles and videos use the same flow; successful identification still depends on readable metadata and mirror coverage.

The API accepts one URL, without credentials or a non-default HTTPS port, up to 2,048 characters. `POST /api/games/identify` returns source metadata, basis, guesses and candidates, with a default limit of 15 and maximum of 20. It uses authenticated API middleware and the separate identify rate-limit scope. Responses carry `Cache-Control: private, no-store`.

There is no JavaScript rendering or page-provided oEmbed discovery, and no image/video-file identification or batch-link request. These are scope limits, not promised follow-up work.

## Identification pipeline

1. [Normalize the link](../../../apps/api/src/share/normalise.ts): remove fragments and known tracking parameters, sort remaining parameters, and canonicalize recognized YouTube, TikTok and IGDB game URLs. Generic parameters such as `t`, `ref` and `si` remain because other sites can use them to select content. `shareId` is the SHA-1 of this URL; `sourceId` is a native video id when recognized, used only on the server.
2. For an IGDB game slug already in the mirror, [the route](../../../apps/api/src/routes/games.ts) returns matching games directly with title basis, skipping metadata fetching and extraction. An unmirrored slug falls through to the ordinary pipeline.
3. [Fetch source metadata](../../../apps/api/src/share/meta.ts). Try a matching vendored oEmbed provider; otherwise fetch HTML. Re-normalize the final redirect destination and try oEmbed again if it changed, then parse `og:title` or fall back to `<title>`. Open Graph supplies the site name as author and optional thumbnail details.
4. [Extract up to three guesses](../../../apps/api/src/share/extract.ts) with the configured OpenAI model. Pass one receives title, author and site, with no URL or tools, and returns `title`, `author` or `none`. Only `none` triggers a web-search pass using the resolved URL, which returns `web` or `none`. Canonical English game titles, including ambiguous original/remake titles, are requested; empty or inconsistent results collapse to `none`.
5. Search the mirror for each guess, up to eight matches each. [Merge candidates](../../../apps/api/src/share/identify.ts) in guess order, deduplicate game ids, and stop at the response limit. Existing search ranking orders matches within each guess. There is no live IGDB request or additional model reranking.

Keeping the URL out of pass one preserves the meaning of title/author basis. Web search is conditional because it adds latency and cost. A successful `none` is different from an extraction failure: failures use the raw source title as a search guess and return `unavailable`, rather than claiming the model found nothing. Model configuration lives in [env.ts](../../../apps/api/src/env.ts); prompt/version and SDK timeout/retry settings live with the extractor. The search pass disables SDK retries to avoid repeating a billed search.

## Retrieval boundary and failures

Provider schemes and endpoints are [vendored](../../../apps/api/src/share/providers.json), with a reviewable [refresh workflow](../../../.github/workflows/oembed-providers.yml), rather than fetched during requests. [Provider matching](../../../apps/api/src/share/provider-match.ts) compares the parsed host separately from path/query patterns; a matching provider is not an exemption from network checks.

All oEmbed and page requests use [safeFetch](../../../apps/api/src/share/safe-fetch.ts) and the [IP policy](../../../apps/api/src/share/ip-policy.ts): validate every URL and redirect, reject disallowed addresses across all DNS answers, and pin the checked address into the connection. The implementation pairs undici's fetch and dispatcher, and refuses an injected global fetch. This avoids the check-then-resolve gap; mocked fetch tests alone cannot demonstrate real socket behavior.

The metadata ladder has an eight-second budget, five-second per-hop timeout and at most three redirects per fetch. MIME types are checked exactly. oEmbed JSON is capped at 64 KiB; HTML is truncated at 512 KiB and parsed for head metadata with `htmlparser2`. Truncation permits a useful head even when a page has a large application body, but metadata beyond the retained prefix remains unreadable.

| Condition                                                               | Implemented result                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Invalid URL shape or request body                                       | 422 validation problem                                                      |
| oEmbed 401/403/404                                                      | Terminal source-gone response, 404; do not scrape an unavailable-video page |
| Other oEmbed failure                                                    | Continue to HTML within the remaining budget                                |
| HTML 401/403                                                            | Source blocked, 422                                                         |
| HTML 404/410                                                            | Source gone, 404                                                            |
| Successful HTML without a usable title                                  | Source unreadable, 422                                                      |
| Network/address/redirect/MIME failure or other unsuccessful HTML status | Fetch failed, 502                                                           |
| Either extraction pass throws                                           | Successful response with raw-title guesses and `unavailable` basis          |
| Both extraction passes find nothing                                     | Successful response with `none` basis and no candidates                     |

See [oEmbed parsing](../../../apps/api/src/share/oembed.ts), [HTML parsing](../../../apps/api/src/share/opengraph.ts) and [problem definitions](../../../apps/api/src/problems.ts). Invalid thumbnail data becomes null without discarding otherwise usable metadata. Five-hundred-level responses do not expose upstream exception messages.

## Cache identities and compatibility

[Cache keys](../../../apps/api/src/cache-keys.ts) separate two identities: metadata is cached for seven days by the requested normalized link, while extraction is cached for 30 days by the resolved link, model and prompt version. Short and canonical links can therefore share extraction work. Failures escape both loaders and are not cached. The final candidate list is assembled anew from the ordinary versioned search cache, so mirror updates can change candidates without repeating extraction.

**Known freshness limit:** extraction keys do not include the source title or author. If metadata changes for the same resolved URL, a prior extraction can remain until its TTL expires or the model/prompt version changes. The cache-key comment claiming metadata is encoded in the key is broader than the implementation.

[The wire contract](../../../packages/contracts/src/share.ts) retains two legacy fields:

- `source.provider` is only a thumbnail-sizing token, `youtube` or `tiktok`; it is not a publisher name. Older app builds can crash on unknown values, so the original proposal to widen it was rejected. The real provider remains in server metadata.
- `identified` remains for older clients; the route sets it false only for `unavailable`. New clients use `basis`, which describes evidence, not certainty that a candidate is correct.

## iOS experience

[Native intent routing](../../../apps/mobile/src/app/+native-intent.ts) opens `/shared`; [payload handling](../../../apps/mobile/src/features/share/use-shared-url.ts) selects the first HTTPS link from resolved website or text content. The pending state is checked before errors and missing-link states, avoiding an initial terminal-state flash or a disabled query that spins forever.

The [share screen](../../../apps/mobile/src/features/share/share-screen.tsx) sits in an adaptive modal (full-screen on compact windows, page sheet on wide windows) with a searching illustration, a source header and basis-dependent candidate section. Selecting a candidate pushes detail within the share stack. A root Stack allows the modal to sit over the tab controller; the original transparent bottom-sheet design was abandoned after device checks exposed problems with the nested presentation.

The [source header](../../../apps/mobile/src/features/share/share-header.tsx) scrolls with results, including the extraction-unavailable warning. It shows a title, optional author, decorative thumbnail and clickable destination hostname. Deriving the label from `pageUrl` avoids trusting a publisher-supplied name that could misrepresent the link destination. Empty results keep source context and offer Search Instead; `none` also offers opening the original page.

[Thumbnail sizing](../../../apps/mobile/src/features/share/source-thumb.ts) uses a fixed 64-point height and reported aspect ratio clamped to 0.5–1.8, defaulting to 16:9. The same box is reserved for a missing or failed image, so signed CDN URL expiry does not move the layout. The original provider-specific 56-point dimensions and YouTube letterbox crop no longer apply.

[The route](../../../apps/mobile/src/app/shared/index.tsx) has a right-hand Close button and large title. Exits clear the incoming payload before dismissing, preventing replay on a later launch; Search Instead dismisses to search. **The tab revealed by `dismissTo("/")` remains explicitly unsettled in the route comment** and requires device verification; do not promise it always returns to Home. Native extension behavior must be checked on the actual build.

## Evidence and remaining limits

Backend coverage includes [normalization](../../../apps/api/test/share-normalise.test.ts), [provider matching](../../../apps/api/test/share-provider-match.test.ts), [address policy](../../../apps/api/test/share-ip-policy.test.ts), [safe fetching](../../../apps/api/test/share-safe-fetch.test.ts), [metadata ladder](../../../apps/api/test/share-meta.test.ts), [oEmbed](../../../apps/api/test/share-oembed.test.ts), [Open Graph](../../../apps/api/test/share-opengraph.test.ts), [extraction sequencing](../../../apps/api/test/share-extract.test.ts), [candidate merging](../../../apps/api/test/share-identify.test.ts) and [route/cache behavior](../../../apps/api/test/identify-routes.test.ts).

Mobile Jest coverage is colocated: [screen](../../../apps/mobile/src/features/share/share-screen.test.tsx), [header](../../../apps/mobile/src/features/share/share-header.test.tsx), [payload handling](../../../apps/mobile/src/features/share/use-shared-url.test.ts), [thumbnail sizing](../../../apps/mobile/src/features/share/source-thumb.test.ts) and [route](../../../apps/mobile/test/routes/shared.test.tsx). Native presentation and cold/warm share intake still need [device verification](../../mobile-device-verification.md).

A valid HTTPS link is not a guarantee of access: authentication, bot challenges, missing server-rendered metadata and absent mirror games can prevent useful candidates. Provider snapshots can become stale and fall back to HTML. Negative metadata failures are not cached, and rate limiting bounds repeated attempts rather than guaranteeing a global extraction-spend ceiling. These limits are not resolved by the original implementation plan.
