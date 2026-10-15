import { createInstance } from "i18next";

import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import ru from "./locales/ru.json";
import uk from "./locales/uk.json";

/**
 * Kept free of react-native and expo-localization, so the copy and the
 * formatting stay testable in plain Node: tests call `initI18n` themselves,
 * and `./index.ts` does the same on device with the language iOS picked.
 *
 * One row per language. `formatLocale` is region-qualified so a date does not
 * drift to `en-US`.
 */
const LOCALES = {
  en: { translation: en, formatLocale: "en-GB" },
  uk: { translation: uk, formatLocale: "uk-UA" },
  ru: { translation: ru, formatLocale: "ru-RU" },
  de: { translation: de, formatLocale: "de-DE" },
  es: { translation: es, formatLocale: "es-ES" },
} as const;

export type Language = keyof typeof LOCALES;

export const LANGUAGES = Object.keys(LOCALES) as Language[];

export const resources = Object.fromEntries(
  LANGUAGES.map((lng) => [lng, { translation: LOCALES[lng].translation }]),
) as { [L in Language]: { translation: (typeof LOCALES)[L]["translation"] } };

export const i18n = createInstance();

export function isLanguage(code: string | null | undefined): code is Language {
  return LANGUAGES.includes(code as Language);
}

/** Synchronous: the resources are bundled, so the first render already has copy. */
export function initI18n(lng: Language): void {
  void i18n.init({
    lng,
    resources,
    fallbackLng: "en",
    supportedLngs: LANGUAGES,
    // React escapes on render; escaping here would double-encode.
    interpolation: { escapeValue: false },
    initAsync: false,
  });
}

/** The locale for `Intl` and `toLocale*` calls in the current language. */
export function formatLocale(): string {
  return LOCALES[isLanguage(i18n.language) ? i18n.language : "en"].formatLocale;
}
