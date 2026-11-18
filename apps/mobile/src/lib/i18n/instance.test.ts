import { errorCopy } from "@/lib/api/error-copy";
import { ApiError } from "@/lib/api/errors";
import { toCalendarDay } from "@repo/release-dates";

import { ratingLine, releaseDateRow, releaseYear } from "@/features/game/format";
import { formatLocale, i18n, initI18n, LANGUAGES, resources } from "@/lib/i18n/instance";

import appJson from "../../../app.json";

afterEach(() => initI18n("en"));

describe.each(LANGUAGES)("%s copy", (lng) => {
  it("is not left in English", () => {
    if (lng === "en") return;

    initI18n(lng);
    expect(i18n.t("tabs.search")).not.toBe(resources.en.app.tabs.search);
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
  const today = toCalendarDay("2026-11-18");

  it.each([
    ["en", "Released", "22 February 2022", "Release date", "Q3 2027", "TBA"],
    ["uk", "Вийшла", "22 лютого 2022 р.", "Дата виходу", "3-й квартал 2027", "Дата невідома"],
    ["ru", "Вышла", "22 февраля 2022 г.", "Дата выхода", "3-й квартал 2027", "Дата неизвестна"],
    ["de", "Erschienen", "22. Februar 2022", "Erscheinungsdatum", "Q3 2027", "Noch offen"],
    ["es", "Lanzado", "22 de febrero de 2022", "Fecha de lanzamiento", "T3 2027", "Por anunciar"],
  ] as const)("%s", (lng, released, day, upcoming, quarter, unannounced) => {
    initI18n(lng);

    expect(
      releaseDateRow(
        { firstReleaseDate: "2022-02-22T00:00:00.000Z", releaseDatePrecision: "day" },
        today,
      ),
    ).toEqual({ label: released, value: day });
    expect(
      releaseDateRow(
        { firstReleaseDate: "2027-07-01T00:00:00.000Z", releaseDatePrecision: "quarter" },
        today,
      ),
    ).toEqual({ label: upcoming, value: quarter });
    expect(releaseYear({ firstReleaseDate: null })).toBe(unannounced);
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

describe("formatLocale", () => {
  it("is the language's region-qualified locale", () => {
    initI18n("uk");

    expect(formatLocale()).toBe("uk-UA");
  });

  it("falls back to English's before i18next has a language", () => {
    let fresh!: { i18n: typeof i18n; formatLocale: typeof formatLocale };
    jest.isolateModules(() => {
      fresh = jest.requireActual<{ i18n: typeof i18n; formatLocale: typeof formatLocale }>(
        "@/lib/i18n/instance",
      );
    });

    expect(fresh.i18n.language).toBeUndefined();
    expect(fresh.formatLocale()).toBe("en-GB");
  });
});
