import {
  formatLocale as localeFor,
  isLanguage,
  LANGUAGES,
  resources,
  type Language,
} from "@repo/i18n";
import { createInstance } from "i18next";

export { isLanguage, LANGUAGES, resources, type Language };

/**
 * Kept free of expo-localization, so a test picks the language: tests call
 * `initI18n` themselves, and `./index.ts` does the same on device with the
 * language iOS picked. The copy itself lives in `@repo/i18n`.
 */
export const i18n = createInstance();

/** Synchronous: the resources are bundled, so the first render already has copy. */
export function initI18n(lng: Language): void {
  void i18n.init({
    lng,
    resources,
    ns: ["app"],
    defaultNS: "app",
    fallbackLng: "en",
    supportedLngs: LANGUAGES,
    // React escapes on render; escaping here would double-encode.
    interpolation: { escapeValue: false },
    initAsync: false,
  });
}

/** The locale for `Intl` and `toLocale*` calls in the current language. */
export function formatLocale(): string {
  return localeFor(isLanguage(i18n.language) ? i18n.language : "en");
}
