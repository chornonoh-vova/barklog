import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { LANGUAGES } from "@repo/i18n";
import { landing } from "@repo/i18n/landing";
import { describe, expect, it, test } from "vitest";

import { faqEntries, homePath, OG_LOCALE } from "../src/i18n";
import { decode, DIST, homeHtml } from "./support/dist";

const meta = (html: string, key: string) =>
  [...html.matchAll(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`, "g"))].map(
    (match) => decode(match[1]!),
  );

const jsonLd = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1]!) as Record<string, unknown>,
  );

describe.each(LANGUAGES)("%s home page metadata", (lang) => {
  const t = landing[lang];

  it("carries an Open Graph and Twitter card", async () => {
    const html = await homeHtml(lang);

    expect(meta(html, "og:title")).toEqual([t.meta.title]);
    expect(meta(html, "og:description")).toEqual([t.meta.description]);
    expect(meta(html, "og:url")).toEqual([`https://barklog.gg${homePath(lang)}`]);
    expect(meta(html, "og:type")).toEqual(["website"]);
    expect(meta(html, "og:image")).toEqual(["https://barklog.gg/og.jpg"]);
    expect(meta(html, "og:locale")).toEqual([OG_LOCALE[lang]]);
    expect(meta(html, "og:locale:alternate").sort()).toEqual(
      LANGUAGES.filter((other) => other !== lang)
        .map((other) => OG_LOCALE[other])
        .sort(),
    );
    expect(meta(html, "twitter:card")).toEqual(["summary_large_image"]);
  });

  it("offers Safari's Smart App Banner", async () => {
    expect(meta(await homeHtml(lang), "apple-itunes-app")).toEqual(["app-id=6807319879"]);
  });

  it("describes the app, the FAQ and the site as structured data", async () => {
    const blocks = jsonLd(await homeHtml(lang));

    expect(blocks.map((block) => block["@type"]).sort()).toEqual([
      "FAQPage",
      "MobileApplication",
      "WebSite",
    ]);

    const app = blocks.find((block) => block["@type"] === "MobileApplication")!;
    expect(app).toMatchObject({
      name: "Barklog",
      operatingSystem: "iOS, iPadOS",
      inLanguage: lang,
      description: t.meta.description,
      installUrl: "https://apps.apple.com/app/barklog/id6807319879",
      offers: { "@type": "Offer", price: "0" },
    });
    expect(app).not.toHaveProperty("aggregateRating");
  });

  it("gives the FAQ structured data the same entries the page shows", async () => {
    // The visible list is checked in home.test.ts; both render faqEntries().
    const faq = jsonLd(await homeHtml(lang)).find((block) => block["@type"] === "FAQPage")!;
    const entities = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[];

    expect(entities.map((entity) => ({ q: entity.name, a: entity.acceptedAnswer.text }))).toEqual(
      faqEntries(lang),
    );
  });
});

test("the social image the cards name is in the build", async () => {
  await expect(access(path.join(DIST, "og.jpg"))).resolves.toBeUndefined();
});

test("the legal pages carry a card too, in English", async () => {
  const html = await readFile(path.join(DIST, "privacy", "index.html"), "utf8");

  expect(meta(html, "og:image")).toEqual(["https://barklog.gg/og.jpg"]);
  expect(meta(html, "og:locale")).toEqual(["en_US"]);
  expect(meta(html, "og:locale:alternate")).toEqual([]);
});

test("the web manifest describes the app as the English hero does", async () => {
  const manifest = JSON.parse(await readFile(path.join(DIST, "site.webmanifest"), "utf8")) as {
    description: string;
  };

  expect(manifest.description).toBe(landing.en.hero.subtitle);
});
