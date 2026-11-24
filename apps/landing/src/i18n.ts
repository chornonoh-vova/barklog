import { type Language, LANGUAGES } from "@repo/i18n";
import { landing, type LandingCopy } from "@repo/i18n/landing";

/** English lives at the root; every other language under its code. */
export function homePath(lang: Language): string {
  return lang === "en" ? "/" : `/${lang}/`;
}

export function copy(lang: Language): LandingCopy {
  return landing[lang];
}

/** Each language named in itself, so a reader finds theirs without reading the current one. */
export const NATIVE_NAMES: Record<Language, string> = {
  en: "English",
  uk: "Українська",
  ru: "Русский",
  de: "Deutsch",
  es: "Español",
};

export const OG_LOCALE: Record<Language, string> = {
  en: "en_US",
  uk: "uk_UA",
  ru: "ru_RU",
  de: "de_DE",
  es: "es_ES",
};

/** The FAQ in display order, shared by the visible list and the FAQPage structured data. */
export function faqEntries(lang: Language): { q: string; a: string }[] {
  return Object.values(copy(lang).faq.items);
}

/** Every home page's hreflang alternates: one per language, plus x-default for the English root.
 * The page head and the sitemap both render this list, so they cannot disagree. */
export function homeAlternates(): { hreflang: string; path: string }[] {
  return [
    ...LANGUAGES.map((lang) => ({ hreflang: lang, path: homePath(lang) })),
    { hreflang: "x-default", path: "/" },
  ];
}
