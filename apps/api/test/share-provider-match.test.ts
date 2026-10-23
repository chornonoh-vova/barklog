import { expect, test } from "vitest";

import { matchesScheme, matchProvider } from "../src/share/provider-match.js";

test("anchors the pattern so a lookalike host cannot match", () => {
  const scheme = "https://*.youtube.com/watch*";

  expect(matchesScheme(scheme, "https://www.youtube.com/watch?v=abc")).toBe(true);
  expect(matchesScheme(scheme, "https://a.youtube.com.evil.test/watch?v=abc")).toBe(false);
  expect(matchesScheme(scheme, "https://evil.test/?u=https://www.youtube.com/watch?v=abc")).toBe(
    false,
  );
});

test("a host wildcard cannot cross a path separator into a later segment", () => {
  const scheme = "https://*.youtube.com/watch*";

  // A text glob would let the host wildcard swallow "evil.com/x" and pick up
  // ".youtube.com/watch" on the other side of the "/". Parsed, the host is
  // evil.com.
  expect(matchesScheme(scheme, "https://evil.com/x.youtube.com/watch?v=1")).toBe(false);
});

test("a backslash cannot smuggle a foreign host past the wildcard", () => {
  const scheme = "https://*.youtube.com/watch*";
  const raw = "https://evil.com\\x.youtube.com/watch?v=1";

  // WHATWG parses this to host evil.com.
  expect(new URL(raw).hostname).toBe("evil.com");
  expect(matchesScheme(scheme, raw)).toBe(false);
  expect(matchesScheme(scheme, "https://www.youtube.com/watch?v=ok")).toBe(true);
});

test("a host wildcard spans one label, not a path", () => {
  const scheme = "https://*.flickr.com/photos/*";

  expect(matchesScheme(scheme, "https://www.flickr.com/photos/12345")).toBe(true);
  expect(matchesScheme(scheme, "https://flickr.com/photos/12345")).toBe(false);
});

test("a trailing wildcard swallows the query", () => {
  const scheme = "https://vimeo.com/*";

  expect(matchesScheme(scheme, "https://vimeo.com/123456789")).toBe(true);
  expect(matchesScheme(scheme, "https://vimeo.com/123456789?share=copy")).toBe(true);
});

test("literal parts match literally, regex metacharacters included", () => {
  const scheme = "https://example.test/a.b+c/*";

  expect(matchesScheme(scheme, "https://example.test/a.b+c/x")).toBe(true);
  expect(matchesScheme(scheme, "https://example.test/aXbYc/x")).toBe(false);
});

test("finds real providers from the snapshot", () => {
  expect(matchProvider("https://www.youtube.com/watch?v=1vs0lLIRt7w")?.name).toBe("YouTube");
  expect(matchProvider("https://www.tiktok.com/@u/video/7123456789012345678")?.name).toBe("TikTok");
  expect(matchProvider("https://vimeo.com/123456789")?.name).toBe("Vimeo");
});

test("returns null for a page no provider claims", () => {
  expect(matchProvider("https://www.ign.com/articles/a-review")).toBeNull();
});

test("vm.tiktok.com short links do not match, by design", () => {
  expect(matchProvider("https://vm.tiktok.com/ZMabcdefg/")).toBeNull();
});

test("twitch is not in the registry and matches nothing", () => {
  expect(matchProvider("https://www.twitch.tv/somechannel")).toBeNull();
});

test("overlapping schemes resolve deterministically to the first provider in snapshot order", () => {
  const first = matchProvider("https://v.afree.ca/ST/");
  expect(first?.name).toBe("afreecaTV");
});

// The matcher must hold up on its own, not only behind `normaliseShare`: a raw
// url whose host is foreign must never be claimed by a provider.
test.each([
  ["a query that carries the provider's host", "https://evil.test?.youtube.com/watch?v=1"],
  ["a fragment that carries the provider's host", "https://evil.test#.youtube.com/watch?v=1"],
  ["credentials in front of a foreign host", "https://www.youtube.com@evil.test/watch?v=1"],
  ["credentials and a query together", "https://x@evil.test?.youtube.com/watch?v=1"],
])("a foreign host is not claimed through %s", (_, url) => {
  expect(new URL(url).hostname).toBe("evil.test");
  expect(matchProvider(url)).toBeNull();
});

test("credentials in front of the provider's own host are refused too", () => {
  expect(matchProvider("https://user:pass@www.youtube.com/watch?v=1")).toBeNull();
});

test("a non-default port is not the provider's site", () => {
  expect(matchProvider("https://www.youtube.com:8443/watch?v=1")).toBeNull();
});

test("an unparseable url matches nothing", () => {
  expect(matchProvider("not a url")).toBeNull();
});
