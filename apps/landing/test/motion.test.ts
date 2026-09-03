import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

test("the reveal script is bundled, not inline", async () => {
  const html = await readFile(path.join(DIST, "index.html"), "utf8");

  expect(html).toMatch(/<script type="module" src="\/_astro\/[^"]+\.js"><\/script>/);
});

test("the bundle honours prefers-reduced-motion", async () => {
  const assets = await readdir(path.join(DIST, "_astro"));
  const scripts = assets.filter((name) => name.endsWith(".js"));
  const sources = await Promise.all(
    scripts.map((name) => readFile(path.join(DIST, "_astro", name), "utf8")),
  );

  expect(sources.some((source) => source.includes("prefers-reduced-motion"))).toBe(true);
});

test("the legal pages still ship no script", async () => {
  for (const route of ["terms", "privacy"]) {
    const html = await readFile(path.join(DIST, route, "index.html"), "utf8");

    expect(html).not.toMatch(/<script/i);
  }
});
