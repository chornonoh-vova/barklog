import {
  RATING_MAX,
  type BacklogStatsWire,
  type BacklogStatus,
  type GameSummaryWire,
} from "@repo/contracts";
import type { SFSymbol } from "sf-symbols-typescript";

/** `en-GB` is fixed, not taken from the device: these are catalogue dates, and
 * a stable format keeps the detail rows from reflowing. */

const STATUS_LABELS: Record<BacklogStatus, string> = {
  waiting: "Waiting",
  playing: "Playing",
  completed: "Completed",
  abandoned: "Abandoned",
};

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
const ratingsCount = (count: number) =>
  `${count.toLocaleString("en-GB")} ${count === 1 ? "rating" : "ratings"}`;

/** "12 games" — shared by the visible and spoken stats lines. */
const gamesCount = (total: number) => `${total} ${total === 1 ? "game" : "games"}`;

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

  return `Rated ${Math.round(input.totalRating)} out of 100, from ${ratingsCount(input.totalRatingCount)}`;
}

export function statsLine(stats: Pick<BacklogStatsWire, "total" | "averageRating">): string {
  const games = gamesCount(stats.total);

  return stats.averageRating === null ? games : `${games}${SEPARATOR}avg ★${stats.averageRating}`;
}

/** `statsLine` for VoiceOver, without the glyph. */
export function statsLineSpoken(stats: Pick<BacklogStatsWire, "total" | "averageRating">): string {
  const games = gamesCount(stats.total);

  return stats.averageRating === null
    ? games
    : `${games}, average rating ${stats.averageRating} out of ${RATING_MAX}`;
}

export function statusLabel(status: BacklogStatus): string {
  return STATUS_LABELS[status];
}

export function statusSymbol(status: BacklogStatus): SFSymbol {
  return STATUS_SYMBOLS[status];
}

export function statusButtonLabel(status: BacklogStatus | null): string {
  return status === null ? "Add to Backlog" : statusLabel(status);
}

export function statusButtonSymbol(status: BacklogStatus | null): SFSymbol {
  return status === null ? "plus" : statusSymbol(status);
}

export function ratingButtonLabel(rating: number | null): string {
  return rating === null ? "Rate" : String(rating);
}

export function ratingButtonSymbol(rating: number | null): SFSymbol {
  return rating === null ? "star" : "star.fill";
}

/** For VoiceOver: the visible label is a bare number beside a star. */
export function ratingSpoken(rating: number | null): string {
  return rating === null ? "Rate this game" : `Rating, ${rating} out of ${RATING_MAX}`;
}

/** `rowSubtitle` without the `★`, which VoiceOver reads as "black star". */
export function rowSubtitleSpoken(entry: { status: BacklogStatus; rating: number | null }): string {
  return entry.rating === null
    ? statusLabel(entry.status)
    : `${statusLabel(entry.status)}, rated ${entry.rating} out of ${RATING_MAX}`;
}

export function rowSubtitle(entry: { status: BacklogStatus; rating: number | null }): string {
  return entry.rating === null
    ? statusLabel(entry.status)
    : `${statusLabel(entry.status)}${SEPARATOR}★${entry.rating}`;
}

export function releaseDateLine(iso: string | null): string {
  if (iso === null) return "Unknown";

  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
