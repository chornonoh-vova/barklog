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

test("every image has alt text", async () => {
  const html = await home();

  for (const tag of html.match(/<img[^>]*>/g) ?? []) {
    expect(tag, `an <img> has no alt attribute: ${tag}`).toMatch(/\salt="/);
  }
});
