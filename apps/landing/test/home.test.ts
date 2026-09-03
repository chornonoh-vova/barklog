import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const home = () => readFile(path.resolve(import.meta.dirname, "../dist/index.html"), "utf8");

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

test("exactly one App Store badge, and it is Apple's own artwork", async () => {
  const html = await home();

  // Apple's guidelines allow one badge per layout, which is why the masthead
  // carries the app icon and no App Store link. The title comes from the file
  // in the App Store Marketing Tools bundle; if it is absent, someone has
  // recreated the badge by hand, which the guidelines forbid outright.
  const badges = html.match(/Download_on_the_App_Store_Badge/g) ?? [];

  expect(badges, "the page must carry exactly one App Store badge").toHaveLength(1);
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

test("the copy avoids marketing filler", async () => {
  const text = (await home()).toLowerCase();

  for (const word of BANNED) {
    expect(text, `the copy contains "${word}"`).not.toContain(word);
  }
});

test("the copy claims no dog feature", async () => {
  // The README says "a cute dog companion keeping score". No such feature
  // exists in the app — the dog is the mark. See the spec, section 5.2.
  expect(await home()).not.toMatch(/keeping score|your companion|streak/i);
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

  // One per feature section plus the hero. A screenshot that lost its alt
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
