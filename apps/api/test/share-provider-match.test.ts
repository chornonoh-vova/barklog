import { expect, test } from "vitest";

import { matchProvider, schemeToRegExp } from "../src/share/provider-match.js";

test("anchors the pattern so a lookalike host cannot match", () => {
  const pattern = schemeToRegExp("https://*.youtube.com/watch*");

  expect(pattern.test("https://www.youtube.com/watch?v=abc")).toBe(true);
  expect(pattern.test("https://a.youtube.com.evil.test/watch?v=abc")).toBe(false);
  expect(pattern.test("https://evil.test/?u=https://www.youtube.com/watch?v=abc")).toBe(false);
});

test("a host wildcard cannot cross a path separator into a later segment", () => {
  const pattern = schemeToRegExp("https://*.youtube.com/watch*");

  // A naive `.*` conversion of the host wildcard matches this: it lets the
  // wildcard swallow "evil.com/x" and pick up ".youtube.com/watch" on the
  // other side of the "/". `[^/]*` refuses it.
  expect(pattern.test("https://evil.com/x.youtube.com/watch?v=1")).toBe(false);
});

test("a host wildcard spans one label, not a path", () => {
  const pattern = schemeToRegExp("https://*.flickr.com/photos/*");

  expect(pattern.test("https://www.flickr.com/photos/12345")).toBe(true);
  expect(pattern.test("https://flickr.com/photos/12345")).toBe(false);
});

test("a trailing wildcard swallows the query", () => {
  const pattern = schemeToRegExp("https://vimeo.com/*");

  expect(pattern.test("https://vimeo.com/123456789")).toBe(true);
  expect(pattern.test("https://vimeo.com/123456789?share=copy")).toBe(true);
});

test("escapes regex metacharacters in the literal parts", () => {
  const pattern = schemeToRegExp("https://example.test/a.b+c/*");

  expect(pattern.test("https://example.test/a.b+c/x")).toBe(true);
  expect(pattern.test("https://example.test/aXbYc/x")).toBe(false);
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
