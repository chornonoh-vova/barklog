import { expect, test, vi } from "vitest";

import { fetchPage, parseOpenGraph } from "../src/share/opengraph.js";

const PUBLIC = async () => [{ address: "93.184.216.34", family: 4 as const }];
const deadline = () => Date.now() + 8_000;

test("reads og:title, og:site_name and og:image with dimensions", () => {
  const html = `<html><head>
    <meta property="og:title" content="Hollow Knight: Silksong Review">
    <meta property="og:site_name" content="IGN">
    <meta property="og:image" content="https://assets.ign.com/a.jpg">
    <meta property="og:image:width" content="1280">
    <meta property="og:image:height" content="720">
  </head><body>ignored</body></html>`;

  expect(parseOpenGraph(html)).toEqual({
    title: "Hollow Knight: Silksong Review",
    siteName: "IGN",
    imageUrl: "https://assets.ign.com/a.jpg",
    imageWidth: 1280,
    imageHeight: 720,
  });
});

test("accepts name= as well as property=, which many sites emit", () => {
  const html = `<head><meta name="og:title" content="A Title"></head>`;
  expect(parseOpenGraph(html)?.title).toBe("A Title");
});

test("falls back to <title> when no og:title exists", () => {
  const html = `<html><head><title>  Plain Title  </title></head></html>`;

  expect(parseOpenGraph(html)).toEqual({
    title: "Plain Title",
    siteName: null,
    imageUrl: null,
    imageWidth: null,
    imageHeight: null,
  });
});

test("prefers og:title over <title>", () => {
  const html = `<head><title>Site name - Page</title><meta property="og:title" content="Page"></head>`;
  expect(parseOpenGraph(html)?.title).toBe("Page");
});

test("falls back to <title> when og:title is present but empty", () => {
  const html = `<head><title>Real Title</title><meta property="og:title" content=""></head>`;
  expect(parseOpenGraph(html)?.title).toBe("Real Title");
});

test("falls back to <title> when og:title is present but whitespace-only", () => {
  const html = `<head><title>Real Title</title><meta property="og:title" content="   "></head>`;
  expect(parseOpenGraph(html)?.title).toBe("Real Title");
});

test("returns null when the page carries no title at all", () => {
  expect(parseOpenGraph("<html><head></head><body>hi</body></html>")).toBeNull();
  expect(parseOpenGraph("")).toBeNull();
});

test("ignores a title that is only whitespace", () => {
  expect(parseOpenGraph("<head><title>   </title></head>")).toBeNull();
});

test("drops a non-https og:image", () => {
  const html = `<head><meta property="og:title" content="A"><meta property="og:image" content="http://x.test/a.jpg"></head>`;

  expect(parseOpenGraph(html)?.imageUrl).toBeNull();
});

test("stops at </head> so body content cannot supply a title", () => {
  const html = `<head></head><body><title>From The Body</title></body>`;
  expect(parseOpenGraph(html)).toBeNull();
});

test("keeps the first og:title when a page emits the tag twice", () => {
  const html = `<head><meta property="og:title" content="First"><meta property="og:title" content="Second"></head>`;
  expect(parseOpenGraph(html)?.title).toBe("First");
});

test("does not choke on a document with no head at all", () => {
  expect(parseOpenGraph("<html><body><p>hi</p></body></html>")).toBeNull();
});

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

test("fetchPage returns the body and the resolved final url", async () => {
  const fetchImpl = vi.fn(async () => html("<head><title>A Page</title></head>"));

  const result = await fetchPage(
    "https://example.test/a",
    deadline(),
    fetchImpl as unknown as typeof fetch,
    PUBLIC,
  );

  expect(result.html).toContain("A Page");
  expect(result.finalUrl).toBe("https://example.test/a");
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("fetchPage follows a redirect and reports the resolved url", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://example.test/b" } }),
    )
    .mockResolvedValueOnce(html("<head><title>B Page</title></head>"));

  const result = await fetchPage(
    "https://example.test/a",
    deadline(),
    fetchImpl as unknown as typeof fetch,
    PUBLIC,
  );

  expect(result.finalUrl).toBe("https://example.test/b");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("a fetch failure propagates rather than being swallowed", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new Error("socket hang up");
  });

  await expect(
    fetchPage("https://example.test/a", deadline(), fetchImpl as unknown as typeof fetch, PUBLIC),
  ).rejects.toThrow();
});
