import { describe, expect, it, vi } from "vitest";

import { MAX_REDIRECTS, parseShareUrl, resolveShortLink } from "../src/share/canonicalise.js";

describe("parseShareUrl", () => {
  it("reads a watch URL, dropping tracking parameters", () => {
    const result = parseShareUrl("https://www.youtube.com/watch?v=1vs0lLIRt7w&t=42s&si=abc");

    expect(result).toEqual({
      kind: "video",
      ref: {
        provider: "youtube",
        videoId: "1vs0lLIRt7w",
        pageUrl: "https://www.youtube.com/watch?v=1vs0lLIRt7w",
      },
    });
  });

  it("reads a youtu.be short URL", () => {
    expect(parseShareUrl("https://youtu.be/1vs0lLIRt7w?t=42")).toMatchObject({
      kind: "video",
      ref: { videoId: "1vs0lLIRt7w" },
    });
  });

  it("reads a Shorts URL", () => {
    expect(parseShareUrl("https://www.youtube.com/shorts/1vs0lLIRt7w")).toMatchObject({
      kind: "video",
      ref: { videoId: "1vs0lLIRt7w" },
    });
  });

  it("reads a TikTok video URL and keeps the creator path, which oEmbed needs", () => {
    const result = parseShareUrl("https://www.tiktok.com/@snam/video/7123456789012345678?is=1");

    expect(result).toEqual({
      kind: "video",
      ref: {
        provider: "tiktok",
        videoId: "7123456789012345678",
        pageUrl: "https://www.tiktok.com/@snam/video/7123456789012345678",
      },
    });
  });

  it("defers a TikTok short link, which oEmbed will not accept", () => {
    expect(parseShareUrl("https://vm.tiktok.com/ZMabcdef/")).toEqual({
      kind: "shortLink",
      url: "https://vm.tiktok.com/ZMabcdef/",
    });
    expect(parseShareUrl("https://www.tiktok.com/t/ZMabcdef/")).toMatchObject({
      kind: "shortLink",
    });
  });

  it("is unsupported for a wrong host, a wrong scheme, or a malformed id", () => {
    expect(parseShareUrl("https://vimeo.com/12345")).toEqual({ kind: "unsupported" });
    expect(parseShareUrl("http://www.youtube.com/watch?v=1vs0lLIRt7w")).toEqual({
      kind: "unsupported",
    });
    expect(parseShareUrl("https://www.youtube.com/watch?v=tooshort")).toEqual({
      kind: "unsupported",
    });
    expect(parseShareUrl("https://www.youtube.com/feed/subscriptions")).toEqual({
      kind: "unsupported",
    });
  });
});

describe("resolveShortLink", () => {
  const redirectTo = (location: string) =>
    new Response(null, { status: 301, headers: { location } });

  it("follows one hop to the canonical video URL", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectTo("https://www.tiktok.com/@snam/video/7123456789012345678"),
    ) as unknown as typeof fetch;

    const result = await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl);

    expect(result).toMatchObject({ kind: "video", ref: { videoId: "7123456789012345678" } });
  });

  it("refuses to fetch a caller-supplied URL that is not on the allowlist", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectTo("https://www.tiktok.com/@snam/video/7123456789012345678"),
    ) as unknown as typeof fetch;

    expect(await resolveShortLink("https://evil.test/x", fetchImpl)).toEqual({
      kind: "unsupported",
    });
    // The bug this line prevents is an unchecked first fetch — hop 0 is the
    // one case the tail `parseShareUrl` check below cannot cover, since it
    // never runs until after a fetch has already happened.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a redirect that leaves the allowlisted hosts", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectTo("https://evil.test/@snam/video/7123456789012345678"),
    ) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unsupported",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a downgrade to http", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectTo("http://www.tiktok.com/@snam/video/7123456789012345678"),
    ) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unsupported",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after the hop cap rather than following a redirect loop", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectTo("https://vm.tiktok.com/ZMabcdef/"),
    ) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unsupported",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS);
  });

  it("is unsupported when the response carries no Location", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unsupported",
    });
  });

  it("is unreachable, not a throw, when the fetch itself fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unreachable",
    });
  });

  it("is unreachable, not unsupported, when the timeout fires", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted", "TimeoutError");
    }) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unreachable",
    });
  });

  it("is unsupported, not a throw, when the Location header is not a usable URL", async () => {
    const fetchImpl = vi.fn(async () => redirectTo("http://")) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unsupported",
    });
  });
});
