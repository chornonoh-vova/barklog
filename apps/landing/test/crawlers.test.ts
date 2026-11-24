import { readFile } from "node:fs/promises";
import path from "node:path";

import { LANGUAGES } from "@repo/i18n";
import { landing } from "@repo/i18n/landing";
import { expect, test } from "vitest";

import { APP_STORE_URL } from "../src/config";
import { homePath } from "../src/i18n";
import { DIST, resolves } from "./support/dist";

const read = (name: string) => readFile(path.join(DIST, name), "utf8");

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
];

test("robots.txt welcomes every crawler and names the AI ones explicitly", async () => {
  const robots = await read("robots.txt");

  expect(robots).toMatch(/User-agent: \*\nAllow: \//);
  expect(robots).not.toMatch(/Disallow: \/\s*$/m);
  for (const bot of AI_CRAWLERS)
    expect(robots).toMatch(new RegExp(`User-agent: ${bot}\\nAllow: /`));
  expect(robots).toContain("Sitemap: https://barklog.gg/sitemap.xml");
});

test("the sitemap lists every page, and each home page with its alternates", async () => {
  const sitemap = await read("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);

  expect(locs.sort()).toEqual(
    [
      ...LANGUAGES.map((lang) => `https://barklog.gg${homePath(lang)}`),
      "https://barklog.gg/privacy/",
      "https://barklog.gg/support/",
      "https://barklog.gg/terms/",
    ].sort(),
  );

  const homes = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map((match) => match[1]!)
    .filter((url) => url.includes("xhtml:link"));
  expect(homes).toHaveLength(LANGUAGES.length);
  for (const url of homes) {
    expect(url.match(/<xhtml:link rel="alternate" hreflang=/g) ?? []).toHaveLength(
      LANGUAGES.length + 1,
    );
  }

  for (const loc of locs) {
    const href = loc.replace("https://barklog.gg", "");
    expect(await resolves(href), `${loc} is in the sitemap but not in the build`).toBe(true);
  }
});

test("llms.txt summarises the app in plain facts", async () => {
  const llms = await read("llms.txt");

  expect(llms.startsWith("# Barklog\n")).toBe(true);
  expect(llms).toContain(`> ${landing.en.meta.description}`);
  expect(llms).toContain(APP_STORE_URL);
  expect(llms).toContain(landing.en.pricing.body);
  for (const { q, a } of Object.values(landing.en.faq.items)) {
    expect(llms).toContain(`## ${q}`);
    expect(llms).toContain(a);
  }
  expect(llms).not.toMatch(/YouTube or TikTok/i);
});
