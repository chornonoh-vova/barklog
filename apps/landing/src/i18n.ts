import { landing, LANGUAGES, type LandingCopy, type Language } from "@repo/i18n";

/** The site's languages are the app's, in the app's order. */
export const LOCALES: readonly Language[] = LANGUAGES;

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
