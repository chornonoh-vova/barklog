import type { APIRoute } from "astro";

import { homePath, LOCALES } from "../i18n";

const SITE = "https://barklog.gg";

/** English-only pages. Trailing slashes match the canonical URLs Astro.url gives them. */
const LEGAL = ["/support/", "/terms/", "/privacy/"];

const alternates = [
  ...LOCALES.map(
    (lang) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${SITE}${homePath(lang)}"/>`,
  ),
  `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`,
].join("");

/** Generated from the same locale list as the pages, so a new language cannot be left out. */
export const GET: APIRoute = () => {
  const urls = [
    ...LOCALES.map((lang) => `<url><loc>${SITE}${homePath(lang)}</loc>${alternates}</url>`),
    ...LEGAL.map((pathname) => `<url><loc>${SITE}${pathname}</loc></url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
