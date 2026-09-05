import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

const DIST = path.resolve(import.meta.dirname, "../dist");

const read = (route: string) => readFile(path.join(DIST, route, "index.html"), "utf8");

/**
 * /support is not a legal document, but it earns the same two guarantees: it is
 * the URL App Review fetches for the listing's Support link, and it renders in
 * the same zero-JavaScript layout, so a script arriving there would breach the
 * same CSP.
 */
const ROUTES = ["terms", "privacy", "support"];

test("the standalone routes are built as directories", async () => {
  for (const route of ROUTES) {
    await expect(read(route), `/${route} did not build`).resolves.toContain("<h1");
  }
});

test("the standalone pages ship no JavaScript", async () => {
  for (const route of ROUTES) {
    expect(await read(route), `/${route} ships a script`).not.toMatch(/<script/i);
  }
});

test("support reaches the contact address and the issue tracker", async () => {
  const html = await read("support");

  expect(html).toContain("mailto:");
  expect(html).toContain("github.com/chornonoh-vova/barklog");
});
