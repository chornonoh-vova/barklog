import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { LANGUAGES } from "@repo/i18n";
import { describe, expect, it, test } from "vitest";

import { DIST, homeHtml } from "./support/dist";

/** The hero section: from the first <section> to its close. Nothing nests a section inside it. */
const hero = (html: string) => html.slice(html.indexOf("<section"), html.indexOf("</section>"));

/** The decorative ring of covers and the mascot: the element marked data-hero-ring. */
function ring(html: string): string {
  const start = html.indexOf("data-hero-ring");
  expect(start, "the hero has no cover ring").toBeGreaterThan(-1);
  const open = html.lastIndexOf("<div", start);
  // The ring holds only <img> and <span> wrappers, never a nested <div>.
  return html.slice(open, html.indexOf("</div>", start) + "</div>".length);
}

describe.each(LANGUAGES)("%s hero", (lang) => {
  it("holds the headline and the App Store badge", async () => {
    const section = hero(await homeHtml(lang));

    expect(section).toContain("<h1");
    expect(section).toContain("Download_on_the_App_Store_Badge");
  });

  it("keeps the badge out of the cover ring", async () => {
    expect(ring(await homeHtml(lang))).not.toContain("apps.apple.com");
  });
});

test("the cover ring is decorative: hidden from assistive tech, every image alt-less", async () => {
  const markup = ring(await homeHtml("en"));
  const images = [...markup.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);

  expect(markup).toMatch(/^<div[^>]*aria-hidden="true"/);
  expect(images, "six covers and the mascot").toHaveLength(7);
  // Astro writes an empty alt as a bare `alt` attribute, which HTML reads as "".
  for (const image of images) expect(image).toMatch(/\salt(="")?[\s>]/);
});

test("the covers stop moving under reduced motion", async () => {
  const assets = await readdir(path.join(DIST, "_astro"));
  const css = (
    await Promise.all(
      assets
        .filter((name) => name.endsWith(".css"))
        .map((name) => readFile(path.join(DIST, "_astro", name), "utf8")),
    )
  ).join("\n");

  // The bob is declared only under no-preference, so reduce gets no animation
  // at all rather than one that is switched off later.
  const animated = [
    ...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*([a-z-]+)\)\s*\{([^@]*)\}/g),
  ]
    .filter((match) => match[2]!.includes("hero-bob"))
    .map((match) => match[1]);

  expect(animated.length).toBeGreaterThan(0);
  expect(animated.every((preference) => preference === "no-preference")).toBe(true);
  expect(
    css.replace(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^@]*\}/g, ""),
  ).not.toMatch(/animation[^;{}]*hero-bob/);
});

test("the hero no longer shows a phone screenshot", async () => {
  expect(hero(await homeHtml("en"))).not.toContain("The Barklog backlog: a list of games");
});

test("the covers come to rest within five seconds, so no pause control is needed", async () => {
  const assets = await readdir(path.join(DIST, "_astro"));
  const css = (
    await Promise.all(
      assets
        .filter((name) => name.endsWith(".css"))
        .map((name) => readFile(path.join(DIST, "_astro", name), "utf8")),
    )
  ).join("\n");
  const html = await homeHtml("en");

  // WCAG 2.2.2: motion that starts on its own and runs past five seconds
  // alongside other content needs a way to stop it.
  const declaration = css.match(/\.hero-cover\{[^}]*animation:([^;}]+)/)?.[1] ?? "";
  expect(declaration).not.toContain("infinite");
  const seconds = [...declaration.matchAll(/([\d.]+)(m?s)\b/g)].map((m) =>
    m[2] === "ms" ? Number(m[1]) / 1000 : Number(m[1]),
  );
  const iterations = Number(declaration.match(/\s(\d+)(?:\s|$)/)?.[1] ?? 1);
  const delays = [...html.matchAll(/animation-delay:([\d.]+)s/g)].map((m) => Number(m[1]));
  const longestDelay = Math.max(0, ...delays);

  expect(seconds[0]! * iterations + longestDelay).toBeLessThanOrEqual(5);
});
