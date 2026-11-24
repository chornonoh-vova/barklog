import { LANGUAGES } from "@repo/i18n";
import { describe, expect, it, test } from "vitest";

import { builtCss, homeHtml } from "./support/dist";

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

test("the covers move only for people who have not asked for reduced motion", async () => {
  const css = await builtCss();
  const optIn = css.match(
    /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\.hero-cover\{[^}]*\}\}/,
  )?.[0];

  // Declared inside no-preference and nowhere else, so reduce gets no
  // animation at all rather than one switched off later.
  expect(optIn).toContain("hero-bob");
  expect(css.replace(optIn ?? "", "")).not.toMatch(/animation:[^;}]*hero-bob/);
});

test("the covers come to rest, so no pause control is needed", async () => {
  // WCAG 2.2.2: motion that starts on its own and runs past five seconds
  // beside other content needs a way to stop it. global.css keeps the bob
  // to two short iterations; infinite would break that.
  const animation = (await builtCss()).match(/\.hero-cover\{animation:([^;}]+)/)?.[1] ?? "";

  expect(animation).not.toContain("infinite");
  expect(animation).toMatch(/\s[12]\s/);
});
