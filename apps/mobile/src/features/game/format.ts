import type { BacklogStatsWire, BacklogStatus, GameSummaryWire } from "@repo/contracts";
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

export function ratingLine(input: {
  totalRating: number | null;
  totalRatingCount: number;
}): string | null {
  if (input.totalRating === null) return null;

  const count = input.totalRatingCount.toLocaleString("en-GB");
  const noun = input.totalRatingCount === 1 ? "rating" : "ratings";

  return `★ ${Math.round(input.totalRating)}${SEPARATOR}${count} ${noun}`;
}

export function statsLine(stats: Pick<BacklogStatsWire, "total" | "averageRating">): string {
  const games = `${stats.total} ${stats.total === 1 ? "game" : "games"}`;

  return stats.averageRating === null ? games : `${games}${SEPARATOR}avg ★${stats.averageRating}`;
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
  return rating === null ? "" : String(rating);
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
