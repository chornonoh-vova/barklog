import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

const read = (route: string) => readFile(path.join(DIST, route, "index.html"), "utf8");

test("the legal routes are built as directories", async () => {
  await expect(read("terms")).resolves.toContain("<h1");
  await expect(read("privacy")).resolves.toContain("<h1");
});

test("the legal pages ship no JavaScript", async () => {
  for (const route of ["terms", "privacy"]) {
    expect(await read(route)).not.toMatch(/<script/i);
  }
});

test("the terms name the operator, the law, and Apple's role", async () => {
  const html = await read("terms");

  expect(html).toContain("Volodymyr Chornonoh");
  expect(html).toContain("chernonog.vova@gmail.com");
  expect(html).toMatch(/Ukrain/);
  // The single most consequential sentence: deleting an account does not
  // cancel the subscription.
  expect(html).toMatch(/does not cancel/i);
});

test("the privacy policy names every processor", async () => {
  const html = await read("privacy");

  for (const processor of ["Clerk", "RevenueCat", "Apple", "Anthropic", "PlanetScale", "IGDB"]) {
    expect(html, `privacy policy does not mention ${processor}`).toContain(processor);
  }
});

test("the privacy policy states the two strong claims", async () => {
  const html = await read("privacy");

  expect(html).toMatch(/no cookies/i);
  // Only the video's title and channel name reach Anthropic.
  expect(html).toMatch(/title and channel name/i);
});
