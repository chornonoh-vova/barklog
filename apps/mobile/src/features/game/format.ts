import { RATING_MAX, type BacklogStatus, type GameSummaryWire } from "@repo/contracts";
import { formatReleaseDate } from "@repo/i18n";
import {
  localDay,
  releaseDisplay,
  toReleaseDate,
  type CalendarDay,
  type ReleaseDate,
} from "@repo/release-dates";
import { getCalendars } from "expo-localization";
import type { SFSymbol } from "sf-symbols-typescript";

import { currentLanguage, i18n } from "@/lib/i18n/instance";

const STATUS_SYMBOLS: Record<BacklogStatus, SFSymbol> = {
  waiting: "clock",
  playing: "gamecontroller",
  completed: "checkmark.seal",
  abandoned: "xmark.bin",
};

const SEPARATOR = " · ";

export function namesLine(refs: { name: string }[]): string | null {
  return refs.length === 0 ? null : refs.map((ref) => ref.name).join(", ");
}

export function platformNames(
  platforms: { name: string; abbreviation: string | null }[],
): string | null {
  return platforms.length === 0 ? null : platforms.map((p) => p.abbreviation ?? p.name).join(", ");
}

/** The wire fields of a release date. A server that predates precision omits it. */
type Dated = Pick<GameSummaryWire, "firstReleaseDate" | "releaseDatePrecision">;

/** Read only through `@repo/release-dates` (ADR-0010): the app compares no dates. */
function releaseDateOf(game: Dated): ReleaseDate {
  return toReleaseDate(game.firstReleaseDate, game.releaseDatePrecision);
}

/** "2027", true of every precision, or "TBA" when there is no date. */
export function releaseYear(game: Dated): string {
  const date = releaseDateOf(game);

  return formatReleaseDate(
    date.day === null ? date : { day: date.day, precision: "year" },
    currentLanguage(),
  );
}

export function metaLine(game: Dated & { genres: { name: string }[] }): string {
  const genres = namesLine(game.genres);

  return genres === null ? releaseYear(game) : `${releaseYear(game)}${SEPARATOR}${genres}`;
}

export function summarySubtitle(game: GameSummaryWire): string {
  return releaseYear(game);
}

/** The device's calendar day: release dates are judged against the user's today. */
export function localToday(now: Date = new Date()): CalendarDay {
  return localDay(now, getCalendars()[0]?.timeZone ?? "UTC");
}

/**
 * The detail screen's date row: "Released" only once a precise date has
 * passed, "Release date" otherwise, a lapsed "Q3 2027" included. The value
 * never shows a placeholder day: "5 June 2027", "Q3 2027", "2027", "TBA".
 */
export function releaseDateRow(game: Dated, today: CalendarDay): { label: string; value: string } {
  const date = releaseDateOf(game);
  const released = releaseDisplay(date, today).kind === "released";

  return {
    label: i18n.t(released ? "game.released" : "game.releaseDate"),
    value: formatReleaseDate(date, currentLanguage()),
  };
}

/** "12,481 ratings" — shared by the visible and spoken rating lines. */
const ratingsCount = (count: number) => i18n.t("game.ratingsCount", { count });

export function ratingLine(input: {
  totalRating: number | null;
  totalRatingCount: number;
}): string | null {
  if (input.totalRating === null) return null;

  return `★ ${Math.round(input.totalRating)}${SEPARATOR}${ratingsCount(input.totalRatingCount)}`;
}

/** `ratingLine` for VoiceOver: IGDB scores are out of 100, and `★` reads as
 * "black star". */
export function ratingLineSpoken(input: {
  totalRating: number | null;
  totalRatingCount: number;
}): string | null {
  if (input.totalRating === null) return null;

  return i18n.t("game.ratedSpoken", {
    rating: Math.round(input.totalRating),
    ratings: ratingsCount(input.totalRatingCount),
  });
}

export function statusLabel(status: BacklogStatus): string {
  return i18n.t(`status.${status}`);
}

export function statusSymbol(status: BacklogStatus): SFSymbol {
  return STATUS_SYMBOLS[status];
}

export function statusButtonLabel(status: BacklogStatus | null): string {
  return status === null ? i18n.t("game.addToBacklog") : statusLabel(status);
}

export function statusButtonSymbol(status: BacklogStatus | null): SFSymbol {
  return status === null ? "plus" : statusSymbol(status);
}

export function ratingButtonLabel(rating: number | null): string {
  return rating === null ? i18n.t("game.rate") : String(rating);
}

export function ratingButtonSymbol(rating: number | null): SFSymbol {
  return rating === null ? "star" : "star.fill";
}

/** For VoiceOver: the visible label is a bare number beside a star. */
export function ratingSpoken(rating: number | null): string {
  return rating === null
    ? i18n.t("game.rateSpoken")
    : i18n.t("game.ratingSpoken", { rating, max: RATING_MAX });
}

/** `rowSubtitle` without the `★`, which VoiceOver reads as "black star". */
export function rowSubtitleSpoken(entry: { status: BacklogStatus; rating: number | null }): string {
  return entry.rating === null
    ? statusLabel(entry.status)
    : i18n.t("game.statusRatedSpoken", {
        status: statusLabel(entry.status),
        rating: entry.rating,
        max: RATING_MAX,
      });
}

export function rowSubtitle(entry: { status: BacklogStatus; rating: number | null }): string {
  return entry.rating === null
    ? statusLabel(entry.status)
    : `${statusLabel(entry.status)}${SEPARATOR}★${entry.rating}`;
}
