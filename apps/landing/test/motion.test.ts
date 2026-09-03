import { readdir, readFile } from "node:fs/promises";
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

test("no stylesheet pre-hides a [data-reveal] element", async () => {
  const assets = await readdir(path.join(DIST, "_astro"));
  const stylesheets = assets.filter((name) => name.endsWith(".css"));

  // A rule whose selector mentions [data-reveal] and whose declaration
  // block hides it outright. Deliberately loose about the selector (a
  // comma-separated list, a media query wrapper) and about the hiding
  // technique (opacity, display, visibility) — any of them reintroduces
  // the same failure mode.
  const REVEAL_RULE = /\[data-reveal\][^{}]*\{([^}]*)\}/g;
  const HIDES = /(?:opacity:\s*0\b|display:\s*none\b|visibility:\s*hidden\b)/;

  for (const name of stylesheets) {
    const css = await readFile(path.join(DIST, "_astro", name), "utf8");
    const hidingRules = [...css.matchAll(REVEAL_RULE)]
      .map((match) => match[0])
      .filter((rule) => HIDES.test(rule));

    expect(
      hidingRules,
      `${name} has a rule that hides [data-reveal] in CSS: ${hidingRules.join(", ")}. ` +
        "Hiding an element in CSS is only safe if CSS can also un-hide it. Here, only " +
        "src/scripts/reveal.ts ever un-hides a [data-reveal] element, when it scrolls into " +
        "view — so a stylesheet rule that hides one unconditionally leaves it invisible " +
        "forever if that script is blocked, errors, or never loads. reveal.ts hides only " +
        "off-screen elements, and only from JavaScript, precisely so a page with no " +
        "JavaScript at all renders every section. Move the hiding back into JS instead of " +
        "restoring this rule.",
    ).toEqual([]);
  }
});

test("the legal pages still ship no script", async () => {
  for (const route of ["terms", "privacy"]) {
    const html = await readFile(path.join(DIST, route, "index.html"), "utf8");

    expect(html).not.toMatch(/<script/i);
  }
});
