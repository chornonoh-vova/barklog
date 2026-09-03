import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

test("the reveal script is bundled, not inline", async () => {
  const html = await readFile(path.join(DIST, "index.html"), "utf8");

  expect(html).toMatch(/<script type="module" src="\/_astro\/[^"]+\.js"><\/script>/);
});

// What used to live here — grepping a built bundle for the substring
// "prefers-reduced-motion" — asserts nothing: it would still pass if the
// value were computed and never used, which is exactly the bug that shipped.
// test/reveal.test.ts exercises the script's actual behaviour instead: what
// gets hidden, what's left alone, and that reduced motion is a true no-op.

test("the legal pages still ship no script", async () => {
  for (const route of ["terms", "privacy"]) {
    const html = await readFile(path.join(DIST, route, "index.html"), "utf8");

    expect(html).not.toMatch(/<script/i);
  }
});
