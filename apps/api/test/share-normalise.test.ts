import { expect, test } from "vitest";

import { normaliseShare } from "../src/share/normalise.js";

test("refuses non-https, userinfo, odd ports, and junk", () => {
  expect(normaliseShare("http://www.youtube.com/watch?v=1vs0lLIRt7w")).toBeNull();
  expect(normaliseShare("https://u:p@example.test/a")).toBeNull();
  expect(normaliseShare("https://example.test:8443/a")).toBeNull();
  expect(normaliseShare("not a url")).toBeNull();
  expect(normaliseShare("")).toBeNull();
});

test("rebuilds youtube urls and reports the video id", () => {
  const watch = normaliseShare("https://www.youtube.com/watch?v=1vs0lLIRt7w&t=42&si=abc");
  expect(watch?.url).toBe("https://www.youtube.com/watch?v=1vs0lLIRt7w");
  expect(watch?.sourceId).toBe("1vs0lLIRt7w");

  expect(normaliseShare("https://youtu.be/1vs0lLIRt7w")?.url).toBe(
    "https://www.youtube.com/watch?v=1vs0lLIRt7w",
  );
  expect(normaliseShare("https://www.youtube.com/shorts/abcdefghijk")?.url).toBe(
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  expect(normaliseShare("https://m.youtube.com/watch?v=1vs0lLIRt7w")?.url).toBe(
    "https://www.youtube.com/watch?v=1vs0lLIRt7w",
  );
});

test("rebuilds tiktok video urls and reports the video id", () => {
  const url = "https://www.tiktok.com/@creator/video/7123456789012345678?is_from_webapp=1";
  expect(normaliseShare(url)?.url).toBe(
    "https://www.tiktok.com/@creator/video/7123456789012345678",
  );
  expect(normaliseShare(url)?.sourceId).toBe("7123456789012345678");
});

test("passes other hosts through with unambiguous tracking stripped, ref kept, and no sourceId", () => {
  const result = normaliseShare(
    "https://WWW.IGN.com/articles/a-review?utm_source=x&ref=y&keep=1#top",
  );

  // `ref` is not stripped: on an arbitrary third-party page it can select
  // content, not just track a referrer, so removing it risks serving one
  // page's cached answer for another.
  expect(result?.url).toBe("https://www.ign.com/articles/a-review?keep=1&ref=y");
  expect(result?.sourceId).toBeNull();
});

test("gives the same shareId to two spellings of one video", () => {
  const a = normaliseShare("https://youtu.be/1vs0lLIRt7w?t=9");
  const b = normaliseShare("https://www.youtube.com/watch?v=1vs0lLIRt7w");

  expect(a?.shareId).toBe(b?.shareId);
});

test("gives different shareIds to different urls", () => {
  const a = normaliseShare("https://www.ign.com/a");
  const b = normaliseShare("https://www.ign.com/b");

  expect(a?.shareId).not.toBe(b?.shareId);
});

test("keeps a short link intact so the ladder can resolve it", () => {
  const result = normaliseShare("https://vm.tiktok.com/ZMabcdef/");

  expect(result?.url).toBe("https://vm.tiktok.com/ZMabcdef/");
  expect(result?.sourceId).toBeNull();
});

test("collapses a bare youtube.com host onto the www spelling", () => {
  const a = normaliseShare("https://youtube.com/watch?v=1vs0lLIRt7w");
  const b = normaliseShare("https://www.youtube.com/watch?v=1vs0lLIRt7w");

  expect(a?.url).toBe(b?.url);
  expect(a?.shareId).toBe(b?.shareId);
});

test("collapses an embed url onto the canonical watch url", () => {
  const embed = normaliseShare("https://www.youtube.com/embed/1vs0lLIRt7w?rel=0");
  const watch = normaliseShare("https://www.youtube.com/watch?v=1vs0lLIRt7w");

  expect(embed?.url).toBe(watch?.url);
  expect(embed?.sourceId).toBe("1vs0lLIRt7w");
  expect(embed?.shareId).toBe(watch?.shareId);
});

test("is not tripped up by a trailing slash on /watch", () => {
  const result = normaliseShare("https://www.youtube.com/watch/?v=1vs0lLIRt7w");

  expect(result?.url).toBe("https://www.youtube.com/watch?v=1vs0lLIRt7w");
  expect(result?.sourceId).toBe("1vs0lLIRt7w");
});

test("uppercases and default ports do not create a second identity", () => {
  const a = normaliseShare("https://WWW.YOUTUBE.COM/watch?v=1vs0lLIRt7w");
  const b = normaliseShare("https://www.youtube.com:443/watch?v=1vs0lLIRt7w");

  expect(a?.url).toBe("https://www.youtube.com/watch?v=1vs0lLIRt7w");
  expect(b?.url).toBe("https://www.youtube.com/watch?v=1vs0lLIRt7w");
});

test("does not collapse two different pages that merely share a stripped param name", () => {
  const a = normaliseShare("https://www.ign.com/x?keep=1");
  const b = normaliseShare("https://www.ign.com/x?keep=2");

  expect(a?.shareId).not.toBe(b?.shareId);
});

test("a query-only reordering of the same page still collapses", () => {
  const a = normaliseShare("https://www.ign.com/x?a=1&b=2");
  const b = normaliseShare("https://www.ign.com/x?b=2&a=1");

  expect(a?.url).toBe(b?.url);
  expect(a?.shareId).toBe(b?.shareId);
});

test("a malformed youtube watch url (bad video id) passes through instead of being refused", () => {
  const result = normaliseShare("https://www.youtube.com/watch?v=short");

  expect(result).not.toBeNull();
  expect(result?.sourceId).toBeNull();
});

test("a malformed tiktok video id passes through instead of being refused", () => {
  const result = normaliseShare("https://www.tiktok.com/@creator/video/not-a-number");

  expect(result).not.toBeNull();
  expect(result?.sourceId).toBeNull();
});

test("keeps params that may select content on third-party pages", () => {
  const a = normaliseShare("https://example.test/search?t=news");
  const b = normaliseShare("https://example.test/search?t=sports");

  expect(a?.url).toBe("https://example.test/search?t=news");
  expect(a?.shareId).not.toBe(b?.shareId);
});

test("still collapses unambiguous tracking noise", () => {
  const a = normaliseShare("https://example.test/a?utm_source=x&gclid=1&fbclid=2");
  const b = normaliseShare("https://example.test/a");

  expect(a?.shareId).toBe(b?.shareId);
});

test("youtube ids are unaffected by the strip list, since the url is rebuilt", () => {
  const a = normaliseShare("https://www.youtube.com/watch?v=1vs0lLIRt7w&t=42&ref=x");
  const b = normaliseShare("https://youtu.be/1vs0lLIRt7w");

  expect(a?.shareId).toBe(b?.shareId);
});
