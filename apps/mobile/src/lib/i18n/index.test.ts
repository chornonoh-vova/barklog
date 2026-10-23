// What the device runs: Hermes has no `Intl.PluralRules`, so `./index.ts`
// installs FormatJS's. Forced here, over Node's native one, so the plural
// forms are checked against the rules the app actually ships.
import "@formatjs/intl-pluralrules/polyfill-force.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/uk.js";
import "@formatjs/intl-pluralrules/locale-data/ru.js";
import "@formatjs/intl-pluralrules/locale-data/de.js";
import "@formatjs/intl-pluralrules/locale-data/es.js";

import { ratingLine } from "@/features/game/format";
import { i18n, initI18n } from "@/lib/i18n/instance";

beforeAll(() => {
  // The setup file initialised i18next before the polyfill replaced the rules.
  i18n.services.pluralResolver.clearCache();
});

describe("plurals on the polyfilled rules", () => {
  it("is the polyfill, not Node's", () => {
    expect("__addLocaleData" in Intl.PluralRules).toBe(true);
  });

  it.each([
    ["en", 1, "1 rating"],
    ["en", 5, "5 ratings"],
    ["uk", 1, "1 оцінка"],
    ["uk", 3, "3 оцінки"],
    ["uk", 5, "5 оцінок"],
    ["uk", 21, "21 оцінка"],
    ["ru", 2, "2 оценки"],
    ["ru", 11, "11 оценок"],
    ["de", 5, "5 Bewertungen"],
    ["es", 1_000_000, "1.000.000 de valoraciones"],
  ] as const)("%s, %i", (lng, count, expected) => {
    initI18n(lng);

    expect(ratingLine({ totalRating: 80, totalRatingCount: count })).toBe(`★ 80 · ${expected}`);
  });
});
