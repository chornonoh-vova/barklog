// Hermes ships no `Intl.PluralRules`, and without it i18next falls back to
// one/other: "5 оцінки" instead of "5 оцінок". The polyfill installs only where
// it is missing, and the locale data must load after it. Kept out of
// `./instance.ts`, so tests run on Node's own rules.
import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/uk.js";
import "@formatjs/intl-pluralrules/locale-data/ru.js";
import "@formatjs/intl-pluralrules/locale-data/de.js";
import "@formatjs/intl-pluralrules/locale-data/es.js";

import { getLocales } from "expo-localization";
import { initReactI18next } from "react-i18next";

import { i18n, initI18n, isLanguage } from "./instance";

// iOS orders `getLocales()` by the user's preference — including the per-app
// language from Settings — and relaunches the app when it changes, so this
// runs once and needs no listener.
const preferred = getLocales()
  .map((locale) => locale.languageCode)
  .find(isLanguage);

i18n.use(initReactI18next);
initI18n(preferred ?? "en");
