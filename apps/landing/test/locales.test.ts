import { readFile } from "node:fs/promises";
import path from "node:path";

import { landing, LANGUAGES } from "@repo/i18n";
import { describe, expect, it, test } from "vitest";

import { homePath } from "../src/i18n";
import { DIST, homeHtml, resolves } from "./support/dist";

const decode = (text: string) =>
  text.replaceAll("&amp;", "&").replaceAll("&#39;", "'").replaceAll("&quot;", '"');

describe.each(LANGUAGES)("%s home page", (lang) => {
  it("declares its language", async () => {
    expect(await homeHtml(lang)).toContain(`<html lang="${lang}"`);
  });

  it("is titled with its store title and subtitle", async () => {
    const title = (await homeHtml(lang)).match(/<title>([^<]*)<\/title>/)?.[1];

    expect(decode(title ?? "")).toBe(landing[lang].meta.title);
  });

  it("names itself as canonical", async () => {
    expect(await homeHtml(lang)).toContain(
      `<link rel="canonical" href="https://barklog.gg${homePath(lang)}"`,
    );
  });

  it("lists every language and x-default as alternates", async () => {
    const html = await homeHtml(lang);
    const alternates = [
      ...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g),
    ];

    expect(alternates.map((match) => match[1]).sort()).toEqual([...LANGUAGES, "x-default"].sort());
    for (const [, hreflang, href] of alternates) {
      const expected =
        hreflang === "x-default" ? "/" : homePath(hreflang as (typeof LANGUAGES)[number]);
      expect(href).toBe(`https://barklog.gg${expected}`);
    }
  });

  it("links to every other language from the footer", async () => {
    const html = await homeHtml(lang);
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));

    for (const other of LANGUAGES.filter((l) => l !== lang)) {
      expect(footer).toContain(`href="${homePath(other)}"`);
    }
  });

  it("only links to pages the build emitted", async () => {
    const html = await homeHtml(lang);
    const hrefs = [...html.matchAll(/<a[^>]*\shref="(\/[^"]*)"/g)].map((match) => match[1]!);

    for (const href of hrefs) expect(await resolves(href), `${href} is a dead link`).toBe(true);
  });
});

test("the legal pages carry no language alternates", async () => {
  const privacy = await readFile(path.join(DIST, "privacy", "index.html"), "utf8");

  expect(privacy).not.toContain("hreflang");
});
