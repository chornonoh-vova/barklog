import { expect, test, vi } from "vitest";

import { fetchSourceMeta, SourceBlocked, SourceUnreadable } from "../src/share/meta.js";
import { htmlResponse, jsonResponse, PUBLIC_LOOKUP } from "./share-fixtures.js";
import { normaliseShare } from "../src/share/normalise.js";
import { SourceGone, SourceUnavailable } from "../src/share/oembed.js";

const YT = normaliseShare("https://www.youtube.com/watch?v=1vs0lLIRt7w")!;
const IGN = normaliseShare("https://www.ign.com/articles/a-review")!;
const SHORT = normaliseShare("https://vm.tiktok.com/ZMabcdef/")!;

test("takes the oEmbed rung when a scheme matches", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse({ title: "A Video", provider_name: "YouTube" }));

  const meta = await fetchSourceMeta(YT, fetchImpl as unknown as typeof fetch, PUBLIC_LOOKUP);

  expect(meta.title).toBe("A Video");
  expect(meta.provider).toBe("YouTube");
  expect(meta.shareId).toBe(YT.shareId);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("an oEmbed 404 is terminal and never scrapes the error page", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse(null, 404));

  await expect(
    fetchSourceMeta(YT, fetchImpl as unknown as typeof fetch, PUBLIC_LOOKUP),
  ).rejects.toThrow(SourceGone);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("an oEmbed 500 falls through to the page", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(null, 500))
    .mockResolvedValueOnce(
      htmlResponse('<head><meta property="og:title" content="Fallback"></head>'),
    );

  const meta = await fetchSourceMeta(YT, fetchImpl as unknown as typeof fetch, PUBLIC_LOOKUP);

  expect(meta.title).toBe("Fallback");
  expect(meta.shareId).toBe(YT.shareId);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("reads og:title for a page no provider claims", async () => {
  const fetchImpl = vi.fn(async () =>
    htmlResponse(
      '<head><meta property="og:title" content="Silksong Review"><meta property="og:site_name" content="IGN"></head>',
    ),
  );

  const meta = await fetchSourceMeta(IGN, fetchImpl as unknown as typeof fetch, PUBLIC_LOOKUP);

  expect(meta.title).toBe("Silksong Review");
  expect(meta.author).toBe("IGN");
  expect(meta.provider).toBe("www.ign.com");
  expect(meta.shareId).toBe(IGN.shareId);
});

/**
 * `vm.tiktok.com` is verified absent from the vendored provider snapshot
 * (`grep -c "vm.tiktok" src/share/providers.generated.ts` is 0), so
 * `matchProvider` genuinely misses it and this exercises the real fallthrough
 * path rather than a scenario the matcher would never hit in production:
 * no scheme match -> HTML rung -> safeFetch itself follows the 302 (this is
 * not hand-built) -> re-normalise the real finalUrl -> re-match -> oEmbed.
 */
test("a short link resolves, re-matches, and lands back on oEmbed", async () => {
  const canonical = "https://www.tiktok.com/@creator/video/7123456789012345678";

  const fetchImpl = vi
    .fn()
    // Hop 1: the short link's own host. safeFetch follows this redirect internally.
    .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: canonical } }))
    // Hop 2: safeFetch's own redirect-follow lands here and reads the body.
    .mockResolvedValueOnce(htmlResponse("<html><body>irrelevant, oEmbed wins first</body></html>"))
    // The re-matched oEmbed call, against the resolved canonical url.
    .mockResolvedValueOnce(jsonResponse({ title: "A Clip", provider_name: "TikTok" }));

  const meta = await fetchSourceMeta(SHORT, fetchImpl as unknown as typeof fetch, PUBLIC_LOOKUP);

  expect(meta.provider).toBe("TikTok");
  expect(meta.pageUrl).toBe(canonical);
  // The extraction cache keys on this, so it must be the resolved id, not the
  // short link's.
  expect(meta.shareId).toBe(normaliseShare(canonical)!.shareId);
  expect(meta.shareId).not.toBe(SHORT.shareId);
  expect(fetchImpl).toHaveBeenCalledTimes(3);

  const secondCallUrl = String(fetchImpl.mock.calls[1]![0]);
  expect(secondCallUrl).toBe(canonical);
  const thirdCallUrl = String(fetchImpl.mock.calls[2]![0]);
  expect(thirdCallUrl).toContain(encodeURIComponent(canonical));
});

test("a page with no title at all is unreadable and terminal", async () => {
  const fetchImpl = vi.fn(async () =>
    htmlResponse("<html><head></head><body>nothing</body></html>"),
  );

  await expect(
    fetchSourceMeta(IGN, fetchImpl as unknown as typeof fetch, PUBLIC_LOOKUP),
  ).rejects.toThrow(SourceUnreadable);
});

test("a page that cannot be read at all stays retriable", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new Error("socket hang up");
  });

  await expect(
    fetchSourceMeta(IGN, fetchImpl as unknown as typeof fetch, PUBLIC_LOOKUP),
  ).rejects.toThrow(SourceUnavailable);
});

test("the two floors are distinguishable by class, not just message", async () => {
  const unreadable = vi.fn(async () => htmlResponse("<html><head></head></html>"));
  const unavailable = vi.fn(async () => {
    throw new Error("timed out");
  });

  await expect(
    fetchSourceMeta(IGN, unreadable as unknown as typeof fetch, PUBLIC_LOOKUP),
  ).rejects.toBeInstanceOf(SourceUnreadable);
  await expect(
    fetchSourceMeta(IGN, unavailable as unknown as typeof fetch, PUBLIC_LOOKUP),
  ).rejects.toBeInstanceOf(SourceUnavailable);
});

test.each([401, 403])(
  "a page that refuses us with %i is blocked, not untitled — the body never arrived",
  async (status) => {
    // Cloudflare's bot challenge, verbatim in shape: a 403 carrying its own
    // titled HTML. Reporting "no title" would describe a page we never read.
    const blocked = () =>
      new Response("<html><head><title>Just a moment...</title></head></html>", {
        status,
        headers: { "content-type": "text/html" },
      });

    await expect(
      fetchSourceMeta(IGN, blocked as unknown as typeof fetch, PUBLIC_LOOKUP),
    ).rejects.toThrow(SourceBlocked);
  },
);

test.each([404, 410])("a page that answers %i is gone", async (status) => {
  const missing = () => new Response(null, { status, headers: { "content-type": "text/html" } });

  await expect(
    fetchSourceMeta(IGN, missing as unknown as typeof fetch, PUBLIC_LOOKUP),
  ).rejects.toThrow(SourceGone);
});

test.each([500, 503])("a page answering %i stays retriable, not a terminal 422", async (status) => {
  const down = () => new Response(null, { status, headers: { "content-type": "text/html" } });

  await expect(
    fetchSourceMeta(IGN, down as unknown as typeof fetch, PUBLIC_LOOKUP),
  ).rejects.toThrow(SourceUnavailable);
});
