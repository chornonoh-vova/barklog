import { RATING_MAX, type BacklogStatus, type GameSummaryWire } from "@repo/contracts";
import type { SFSymbol } from "sf-symbols-typescript";

import { formatLocale, i18n } from "@/i18n/instance";

const STATUS_SYMBOLS: Record<BacklogStatus, SFSymbol> = {
  waiting: "clock",
  playing: "gamecontroller",
  completed: "checkmark.seal",
  abandoned: "xmark.bin",
};

const SEPARATOR = " · ";

function joinParts(parts: (string | null)[]): string | null {
  const present = parts.filter((part): part is string => part !== null && part !== "");

  return present.length === 0 ? null : present.join(SEPARATOR);
}

export function namesLine(refs: { name: string }[]): string | null {
  return refs.length === 0 ? null : refs.map((ref) => ref.name).join(", ");
}

export function platformNames(
  platforms: { name: string; abbreviation: string | null }[],
): string | null {
  return platforms.length === 0 ? null : platforms.map((p) => p.abbreviation ?? p.name).join(", ");
}

export function releaseYear(iso: string | null): string | null {
  return iso === null ? null : String(new Date(iso).getUTCFullYear());
}

export function metaLine(input: {
  firstReleaseDate: string | null;
  genres: { name: string }[];
}): string | null {
  return joinParts([releaseYear(input.firstReleaseDate), namesLine(input.genres)]);
}

export function summarySubtitle(game: GameSummaryWire): string | null {
  return releaseYear(game.firstReleaseDate);
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

/** Region-qualified (`en-GB`, not the device's `en-US`): a catalogue date reads
 * day-first wherever the app's language allows it. */
export function releaseDateLine(iso: string | null): string {
  if (iso === null) return i18n.t("game.unknownDate");

  return new Date(iso).toLocaleDateString(formatLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
