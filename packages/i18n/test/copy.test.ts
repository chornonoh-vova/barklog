import { describe, expect, it } from "vitest";

import { formatLocale, isLanguage, LANGUAGES, resources, type Language } from "../src/index.js";

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

const base = (key: string) => key.replace(PLURAL_SUFFIX, "");

type Namespace = keyof (typeof resources)["en"];

const NAMESPACES = Object.keys(resources.en) as Namespace[];

const copy = (lng: Language, ns: Namespace) => leaves(resources[lng][ns] as Tree);

describe.each(LANGUAGES)("%s copy", (lng) => {
  it("has exactly English's namespaces", () => {
    expect(Object.keys(resources[lng])).toEqual(NAMESPACES);
  });

  describe.each(NAMESPACES)("%s namespace", (ns) => {
    const english = copy("en", ns);
    const translated = copy(lng, ns);

    it("has every key English has, and no others", () => {
      expect(new Set([...translated.keys()].map(base))).toEqual(
        new Set([...english.keys()].map(base)),
      );
    });

    it("has exactly the plural forms the language uses", () => {
      const categories = new Set(new Intl.PluralRules(lng).resolvedOptions().pluralCategories);

      for (const [key, suffixes] of plurals(translated.keys())) {
        expect({ [key]: suffixes }).toEqual({ [key]: categories });
      }
    });

    it("keeps every placeholder and tag of the English copy", () => {
      for (const [key, text] of translated) {
        const englishText = english.get(key) ?? english.get(`${base(key)}_other`);

        expect({ [key]: tokens(text) }).toEqual({ [key]: tokens(englishText ?? "") });
      }
    });
  });
});

describe("formatLocale", () => {
  it("is each language's region-qualified locale", () => {
    expect(LANGUAGES.map(formatLocale)).toEqual(["en-GB", "uk-UA", "ru-RU", "de-DE", "es-ES"]);
  });
});

describe("isLanguage", () => {
  it("accepts a language the app has copy for", () => {
    expect(isLanguage("uk")).toBe(true);
  });

  it.each(["fr", "EN", "", null, undefined])("rejects %p", (code) => {
    expect(isLanguage(code)).toBe(false);
  });
});
