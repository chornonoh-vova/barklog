import de from "./locales/de/app.json" with { type: "json" };
import en from "./locales/en/app.json" with { type: "json" };
import es from "./locales/es/app.json" with { type: "json" };
import ru from "./locales/ru/app.json" with { type: "json" };
import uk from "./locales/uk/app.json" with { type: "json" };

/** The app's copy, typed from English: the source every language matches. */
export type AppResources = typeof en;

/** `formatLocale` is region-qualified so dates do not drift to `en-US`. */
const LOCALES = {
  en: { app: en, formatLocale: "en-GB" },
  uk: { app: uk, formatLocale: "uk-UA" },
  ru: { app: ru, formatLocale: "ru-RU" },
  de: { app: de, formatLocale: "de-DE" },
  es: { app: es, formatLocale: "es-ES" },
} as const;

export type Language = keyof typeof LOCALES;

export const LANGUAGES = Object.keys(LOCALES) as Language[];

/** i18next resources, one namespace per JSON file. */
export const resources: Record<Language, { app: AppResources }> = Object.fromEntries(
  LANGUAGES.map((lng) => [lng, { app: LOCALES[lng].app }]),
) as Record<Language, { app: AppResources }>;

export function isLanguage(code: string | null | undefined): code is Language {
  return LANGUAGES.includes(code as Language);
}

/** The locale for `Intl` and `toLocale*` calls in `language`. */
export function formatLocale(language: Language): string {
  return LOCALES[language].formatLocale;
}
