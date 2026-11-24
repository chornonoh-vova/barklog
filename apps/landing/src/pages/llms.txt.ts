import { LANGUAGES } from "@repo/i18n";
import type { APIRoute } from "astro";

import { APP_STORE_URL, SITE } from "../config";
import { copy, faqEntries, homePath, NATIVE_NAMES } from "../i18n";

/**
 * A plain-Markdown summary for language models (the llms.txt convention),
 * built from the same English copy as the page so the two cannot disagree.
 */
export const GET: APIRoute = () => {
  const t = copy("en");

  const text = [
    "# Barklog",
    "",
    `> ${t.meta.description}`,
    "",
    "## Key facts",
    "",
    "- Platforms: iPhone and iPad (iOS, iPadOS). No Android version.",
    `- Statuses: ${t.faq.items.whatIs.a}`,
    `- Sharing: ${t.share.body}`,
    `- Widgets and stats: ${t.widgets.body}`,
    `- Pricing: ${t.pricing.body} ${t.pricing.cap}`,
    `- Game data: ${t.faq.items.data.a}`,
    `- Languages: ${LANGUAGES.map((lang) => NATIVE_NAMES[lang]).join(", ")}`,
    "",
    ...faqEntries("en").flatMap(({ q, a }) => [`## ${q}`, "", a, ""]),
    "## Links",
    "",
    `- [Barklog on the App Store](${APP_STORE_URL})`,
    ...LANGUAGES.map((lang) => `- [Home page (${NATIVE_NAMES[lang]})](${SITE}${homePath(lang)})`),
    `- [Support](${SITE}/support/)`,
    `- [Terms](${SITE}/terms/)`,
    `- [Privacy policy](${SITE}/privacy/)`,
    "",
  ].join("\n");

  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
