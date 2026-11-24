import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

const read = (route: string) => readFile(path.join(DIST, route, "index.html"), "utf8");

/**
 * /support is not a legal document, but it earns the same two guarantees: it is
 * the URL App Review fetches for the listing's Support link, and it renders in
 * the same zero-JavaScript layout, so a script arriving there would breach the
 * same CSP.
 */
const ROUTES = ["terms", "privacy", "support"];

test("the standalone routes are built as directories", async () => {
  for (const route of ROUTES) {
    await expect(read(route), `/${route} did not build`).resolves.toContain("<h1");
  }
});

test("the standalone pages ship no JavaScript", async () => {
  for (const route of ROUTES) {
    expect(await read(route), `/${route} ships a script`).not.toMatch(/<script/i);
  }
});

test("support reaches the contact address and the issue tracker", async () => {
  const html = await read("support");

  expect(html).toContain("mailto:");
  expect(html).toContain("github.com/chornonoh-vova/barklog");
});

test("the privacy policy describes sharing as the API does it", async () => {
  const privacy = (await read("privacy")).replace(/\s+/g, " ");

  // Any web page can be shared, not only videos from two platforms.
  expect(privacy).not.toMatch(/share a YouTube or TikTok video/i);
  // Pages no oEmbed provider covers are read by Barklog's server itself.
  expect(privacy).toMatch(/Barklog's server/i);
  // Pass 2 of apps/api/src/share/extract.ts sends the link with web search on.
  expect(privacy).toMatch(/search the web/i);
  expect(privacy).toMatch(/the link itself/i);
  expect(privacy).not.toContain("17 November 2026");
});

test("no standalone page says only YouTube or TikTok videos can be shared", async () => {
  for (const route of ROUTES) {
    expect((await read(route)).replace(/\s+/g, " "), `/${route}`).not.toMatch(
      /Share a YouTube or TikTok video/i,
    );
  }
});
