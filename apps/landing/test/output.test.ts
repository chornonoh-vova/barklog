import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

async function htmlFiles(dir: string = DIST): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return htmlFiles(full);

      return entry.name.endsWith(".html") ? [full] : [];
    }),
  );

  return found.flat();
}

/** A <script> with no src= and a non-empty body — what 'unsafe-inline' would be for. */
const INLINE_SCRIPT = /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/i;
const INLINE_STYLE = /<style[^>]*>[\s\S]*?<\/style>/i;
// Only <link>, <script> and <img> elements issue a subresource request — a
// plain <a href> is navigation, not a fetch, so it is deliberately excluded.
const SUBRESOURCE_TAG = /<(?:link|script|img)\b[^>]*>/gi;
const SUBRESOURCE_URL = /(?:src|href)="(https?:\/\/[^"]+)"/;

test("the build produced pages", async () => {
  expect(await htmlFiles()).not.toHaveLength(0);
});

test("no page carries an inline <style>", async () => {
  for (const file of await htmlFiles()) {
    const html = await readFile(file, "utf8");

    expect(
      INLINE_STYLE.test(html),
      `${path.relative(DIST, file)} has an inline <style>. Check build.inlineStylesheets in astro.config.mjs — an inline style forces style-src 'unsafe-inline'.`,
    ).toBe(false);
  }
});

test("no page carries an inline <script>", async () => {
  for (const file of await htmlFiles()) {
    const html = await readFile(file, "utf8");

    expect(
      INLINE_SCRIPT.test(html),
      `${path.relative(DIST, file)} has an inline <script>. Use a bundled module — an inline script forces script-src 'unsafe-inline'.`,
    ).toBe(false);
  }
});

test("no page requests a third-party origin", async () => {
  for (const file of await htmlFiles()) {
    const html = await readFile(file, "utf8");
    const external = [...html.matchAll(SUBRESOURCE_TAG)]
      .map((tag) => tag[0].match(SUBRESOURCE_URL)?.[1])
      .filter((url): url is string => url !== undefined)
      // <link rel="canonical"> is an absolute, same-origin URL (Astro.site) —
      // it isn't fetched by the browser and isn't third-party either way.
      // No exemption for apps.apple.com: Apple's badge artwork is inlined from
      // src/assets/app-store-badge.svg, so it costs no request. An allowance
      // here would quietly re-permit hotlinking it.
      .filter((url) => !url.startsWith("https://barklog.gg/"));

    expect(external, `${path.relative(DIST, file)} loads a third-party resource`).toEqual([]);
  }
});

test("the icon set is built, and every path the head names resolves", async () => {
  const html = await readFile(path.join(DIST, "index.html"), "utf8");

  // Browsers and iOS request some of these by convention rather than by
  // following the link, so a rename breaks them with nothing to notice it.
  const referenced = [...html.matchAll(/<link[^>]*\shref="(\/[^"]+\.(?:ico|png|webmanifest))"/g)]
    .map((match) => match[1])
    .filter((href): href is string => href !== undefined);

  expect(referenced).toEqual(
    expect.arrayContaining([
      "/favicon.ico",
      "/favicon-32.png",
      "/favicon-16.png",
      "/apple-touch-icon.png",
      "/site.webmanifest",
    ]),
  );

  for (const href of referenced) {
    await expect(
      readFile(path.join(DIST, href.slice(1))),
      `${href} is linked from <head> but missing from the build`,
    ).resolves.toBeDefined();
  }
});

test("the web manifest is valid and its icons exist", async () => {
  const manifest = JSON.parse(await readFile(path.join(DIST, "site.webmanifest"), "utf8")) as {
    icons: { src: string }[];
  };

  expect(manifest.icons.length).toBeGreaterThan(0);

  for (const icon of manifest.icons) {
    await expect(
      readFile(path.join(DIST, icon.src.slice(1))),
      `${icon.src} is named in site.webmanifest but missing from the build`,
    ).resolves.toBeDefined();
  }
});
