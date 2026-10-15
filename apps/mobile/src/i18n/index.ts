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
