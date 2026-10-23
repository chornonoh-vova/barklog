import { afterEach, describe, expect, it } from "vitest";

import { errorCopy } from "@/lib/api/error-copy";
import { ApiError } from "@/lib/api/errors";
import { ratingLine, releaseDateLine } from "@/features/game/format";
import { i18n, initI18n, LANGUAGES, resources, type Language } from "@/lib/i18n/instance";

import appJson from "../../../app.json";

type Tree = { [key: string]: string | Tree };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Every leaf as `path → value`. */
function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();

  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;

    if (typeof value === "string") out.set(path, value);
    else for (const [leaf, text] of leaves(value, path)) out.set(leaf, text);
  }

  return out;
}

/** Plural keys grouped under their base key, with the suffixes each one has. */
function plurals(keys: Iterable<string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();

  for (const key of keys) {
    const match = PLURAL_SUFFIX.exec(key);
    if (match === null) continue;

    const base = key.slice(0, match.index);
    out.set(base, (out.get(base) ?? new Set()).add(match[1]!));
  }

  return out;
}

const tokens = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)[^}]*\}\}|<\/?(\w+)>/g)]
    .map((match) => match[1] ?? `<${match[2]}>`)
    // `count` picks the form; a form may spell the number out instead of using it.
    .filter((token) => token !== "count")
    .sort();

const copy = (lng: Language) => leaves(resources[lng].translation as Tree);
const english = copy("en");
const base = (key: string) => key.replace(PLURAL_SUFFIX, "");
const englishBases = new Set([...english.keys()].map(base));

afterEach(() => initI18n("en"));

describe.each(LANGUAGES)("%s copy", (lng) => {
  const translated = copy(lng);

  it("has every key English has, and no others", () => {
    expect(new Set([...translated.keys()].map(base))).toEqual(englishBases);
  });

  it("has exactly the plural forms the language uses", () => {
    const categories = new Set(new Intl.PluralRules(lng).resolvedOptions().pluralCategories);

    for (const [key, suffixes] of plurals(translated.keys())) {
      expect(suffixes, key).toEqual(categories);
    }
  });

  it("keeps every placeholder and tag of the English copy", () => {
    for (const [key, text] of translated) {
      const englishText = english.get(key) ?? english.get(`${base(key)}_other`);

      expect(tokens(text), key).toEqual(tokens(englishText ?? ""));
    }
  });

  it("is not left in English", () => {
    if (lng === "en") return;

    initI18n(lng);
    expect(i18n.t("tabs.search")).not.toBe(resources.en.translation.tabs.search);
  });
});

describe("plurals", () => {
  it.each([
    ["en", 1, "1 rating"],
    ["en", 2, "2 ratings"],
    ["uk", 1, "1 оцінка"],
    ["uk", 2, "2 оцінки"],
    ["uk", 5, "5 оцінок"],
    ["uk", 21, "21 оцінка"],
    ["ru", 1, "1 оценка"],
    ["ru", 3, "3 оценки"],
    ["ru", 11, "11 оценок"],
    ["ru", 22, "22 оценки"],
    ["de", 1, "1 Bewertung"],
    ["de", 5, "5 Bewertungen"],
    ["es", 1, "1 valoración"],
    ["es", 5, "5 valoraciones"],
    ["es", 1_000_000, "1.000.000 de valoraciones"],
  ] as const)("%s, %i", (lng, count, expected) => {
    initI18n(lng);

    expect(ratingLine({ totalRating: 80, totalRatingCount: count })).toBe(`★ 80 · ${expected}`);
  });

  it("groups digits the way the language does", () => {
    initI18n("uk");

    // U+00A0, the no-break space uk-UA groups with.
    expect(ratingLine({ totalRating: 80, totalRatingCount: 12_485 })).toBe(
      "★ 80 · 12\u00a0485 оцінок",
    );
  });
});

describe("release dates", () => {
  it.each([
    ["en", "22 February 2022"],
    ["uk", "22 лютого 2022 р."],
    ["ru", "22 февраля 2022 г."],
    ["de", "22. Februar 2022"],
    ["es", "22 de febrero de 2022"],
  ] as const)("%s", (lng, expected) => {
    initI18n(lng);

    expect(releaseDateLine("2022-02-22T00:00:00.000Z")).toBe(expected);
  });
});

describe("app.json", () => {
  it("declares every language to iOS, so Settings offers it", () => {
    const plugin = (appJson.expo.plugins as unknown[]).find(
      (entry): entry is [string, { supportedLocales: { ios: string[] } }] =>
        Array.isArray(entry) && entry[0] === "expo-localization",
    );

    expect(plugin?.[1].supportedLocales.ios).toEqual([...LANGUAGES]);
  });

  it("localizes the Info.plist in every language", () => {
    expect(Object.keys(appJson.expo.locales)).toEqual([...LANGUAGES]);
  });
});

describe("API error codes", () => {
  it("translates a coded problem instead of showing the server's English", () => {
    initI18n("uk");

    const copy = errorCopy(
      new ApiError({
        status: 404,
        type: "https://barklog.gg/problems/not-found",
        title: "Not Found",
        code: "share_source_gone",
        detail: "That page is unavailable — it may be private or removed.",
      }),
    );

    expect(copy).toEqual({
      title: "Сторінки більше немає",
      description: "Можливо, вона приватна або видалена.",
    });
  });

  it("falls back to the server's detail when there is no code", () => {
    initI18n("uk");

    expect(
      errorCopy(
        new ApiError({
          status: 404,
          type: "about:blank",
          title: "Not Found",
          detail: "No such game.",
        }),
      ),
    ).toEqual({ title: "Not Found", description: "No such game." });
  });
});
