import { LANGUAGES } from "@repo/i18n";
import type { APIRoute } from "astro";

import { LEGAL_PATHS, SITE } from "../config";
import { homeAlternates, homePath } from "../i18n";

const alternates = homeAlternates()
  .map(
    ({ hreflang, path }) =>
      `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${SITE}${path}"/>`,
  )
  .join("");

/** Generated from the same locale list as the pages, so a new language cannot be left out. */
export const GET: APIRoute = () => {
  const urls = [
    ...LANGUAGES.map((lang) => `<url><loc>${SITE}${homePath(lang)}</loc>${alternates}</url>`),
    ...LEGAL_PATHS.map((pathname) => `<url><loc>${SITE}${pathname}</loc></url>`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
