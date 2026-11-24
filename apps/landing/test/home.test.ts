import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { LANGUAGES, resources } from "@repo/i18n";
import { landing } from "@repo/i18n/landing";
import { describe, expect, it, test } from "vitest";

import { decode, homeHtml } from "./support/dist";

const home = () => homeHtml("en");

/** From the design's global constraints. Each is a word humans do not use here. */
const BANNED = [
  "seamlessly",
  "effortlessly",
  "powerful yet simple",
  "revolutionize",
  "elevate",
  "unlock",
  "supercharge",
  "game-changer",
];

test("the hero links to the App Store", async () => {
  expect(await home()).toContain("apps.apple.com");
});

test("the masthead does not link to the App Store", async () => {
  const html = await home();
  const masthead = html.slice(html.indexOf("<header"), html.indexOf("</header>"));

  expect(masthead).not.toContain("apps.apple.com");
});

test("the page links to the legal routes", async () => {
  const html = await home();

  expect(html).toContain('href="/terms"');
  expect(html).toContain('href="/privacy"');
});

test("the page credits IGDB", async () => {
  expect(await home()).toContain("IGDB");
});

test("the free tier is described with the real number", async () => {
  expect(await home()).toMatch(/ten unfinished games|10 unfinished games/i);
});

describe.each(LANGUAGES)("%s copy", (lang) => {
  const t = landing[lang];
  const app = resources[lang].app;

  it("states the free tier in that language", async () => {
    expect(decode(await homeHtml(lang))).toContain(t.pricing.body);
  });

  it("avoids marketing filler", async () => {
    // The banned list is English; the translations are drafted from the same
    // plain store copy, so English is where filler would creep in first.
    const text = (await homeHtml(lang)).toLowerCase();

    for (const word of BANNED) expect(text, `the copy contains "${word}"`).not.toContain(word);
  });

  it("claims no dog feature", async () => {
    // The README says "a cute dog companion keeping score". No such feature
    // exists in the app — the dog is the mark. See the spec, section 5.2.
    expect(await homeHtml(lang)).not.toMatch(/keeping score|your companion|streak/i);
  });

  it("names the statuses as the app does", async () => {
    const html = decode(await homeHtml(lang));

    for (const status of ["waiting", "playing", "completed", "abandoned"] as const) {
      expect(html).toContain(app.status[status]);
      expect(html).toContain(app.backlog.emptyFilter[status].description);
    }
  });

  it("describes every screenshot in that language", async () => {
    const alts = [...(await homeHtml(lang)).matchAll(/<img[^>]*\salt="([^"]+)"/g)].map((match) =>
      decode(match[1]!),
    );

    expect(alts).toEqual([t.share.alt, t.statuses.alt, t.explore.alt, t.widgets.alt]);
  });

  it("answers every question in the FAQ, visibly", async () => {
    const html = decode(await homeHtml(lang));
    const questions = Object.values(t.faq.items);

    expect(html.match(/<details/g) ?? []).toHaveLength(questions.length);
    for (const { q, a } of questions) {
      expect(html).toContain(q);
      expect(html).toContain(a);
    }
  });
});

test("every image is either described or explicitly decorative", async () => {
  const html = await home();

  for (const tag of html.match(/<img[^>]*>/g) ?? []) {
    // `alt` present but empty is the correct marking for a decorative image,
    // and Astro emits it bare. The app icon is one: it sits beside the word
    // "Barklog", so describing it would make a screen reader say the name
    // twice. What must never happen is alt missing altogether, which leaves a
    // screen reader reading out the filename.
    expect(tag, `an <img> has no alt attribute at all: ${tag}`).toMatch(/\salt(=|\s|>)/);
  }
});

test("the screenshots describe the screen, not the file", async () => {
  const html = await home();
  const described = [...html.matchAll(/<img[^>]*\salt="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((alt): alt is string => alt !== undefined);

  // One per feature section; the hero's covers and mascot are decorative. A screenshot that lost its alt
  // would drop out of this list rather than fail the check above, since an
  // empty alt is legal for decoration.
  expect(described.length, "expected four described screenshots").toBe(4);

  for (const alt of described) {
    expect(alt, `alt text should describe the screen: "${alt}"`).not.toMatch(
      /screenshot|\.png|\.webp/i,
    );
    expect(alt.length, `alt text is too short to describe anything: "${alt}"`).toBeGreaterThan(30);
  }
});

test("the footer reaches the support page", async () => {
  // The App Store listing's Support URL points at /support, so a footer link
  // dropped here is the only in-site path to it going missing.
  expect(await home()).toContain('href="/support"');
});

describe.each(LANGUAGES)("%s App Store badge", (lang) => {
  it("is exactly one, labelled in that language", async () => {
    // Apple's guidelines allow one badge per layout, which is why the masthead
    // carries the app icon and no App Store link. The title comes from the file
    // in the App Store Marketing Tools bundle; if it is absent, someone has
    // recreated the badge by hand, which the guidelines forbid outright.
    const html = decode(await homeHtml(lang));

    expect(html.match(/Download_on_the_App_Store_Badge/g) ?? []).toHaveLength(1);
    expect(html).toContain(`aria-label="${landing[lang].badge.label}"`);
  });

  it("is Apple's artwork for that language, or the English badge until it is added", async () => {
    const files = await readdir(path.resolve(import.meta.dirname, "../src/assets"));
    const own = files.includes(`app-store-badge-${lang}.svg`)
      ? `app-store-badge-${lang}.svg`
      : "app-store-badge.svg";
    const svg = await readFile(path.resolve(import.meta.dirname, "../src/assets", own), "utf8");
    const title = svg.match(/<title>([^<]+)<\/title>/)?.[1];

    expect(await homeHtml(lang)).toContain(`<title>${title}</title>`);
  });
});

test("no badge file colours itself with a style attribute the CSP would block", async () => {
  const dir = path.resolve(import.meta.dirname, "../src/assets");
  const badges = (await readdir(dir)).filter((name) => name.startsWith("app-store-badge"));

  for (const name of badges)
    expect(await readFile(path.join(dir, name), "utf8"), name).not.toContain('style="');
});

test("each FAQ marker sits right before its question, not at the far edge", async () => {
  const summaries = (await homeHtml("en")).match(/<summary[^>]*>[\s\S]*?<\/summary>/g) ?? [];

  expect(summaries.length).toBeGreaterThan(0);
  for (const summary of summaries) {
    expect(summary).toMatch(/^<summary[^>]*>\s*<span[^>]*aria-hidden="true"/);
    expect(summary).not.toContain("justify-between");
  }
});
