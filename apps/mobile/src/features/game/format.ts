import type { BacklogStatus } from "@repo/contracts";

/**
 * Every user-facing string built from API data. Pure, so the copy is pinned by
 * tests rather than discovered in a screenshot — and so a game with no release
 * date, no genres and no ratings cannot produce a line reading " · ".
 *
 * The `en-GB` locale is fixed rather than taken from the device: these are
 * dates in a catalogue, not the user's own data, and a stable format keeps the
 * detail screen's rows from reflowing per locale.
 */

const STATUS_LABELS: Record<BacklogStatus, string> = {
  waiting: "Waiting",
  playing: "Playing",
  completed: "Completed",
  abandoned: "Abandoned",
};

/** Joins only the parts that exist, so an absent field leaves no separator. */
function joinParts(parts: (string | null)[], separator: string): string | null {
  const present = parts.filter((part): part is string => part !== null && part !== "");

  return present.length === 0 ? null : present.join(separator);
}

export function releaseYear(iso: string | null): string | null {
  return iso === null ? null : String(new Date(iso).getUTCFullYear());
}

export function metaLine(input: {
  firstReleaseDate: string | null;
  genres: { name: string }[];
}): string | null {
  const genres = input.genres.length === 0 ? null : input.genres.map((g) => g.name).join(", ");

  return joinParts([releaseYear(input.firstReleaseDate), genres], " · ");
}

export function ratingLine(input: {
  totalRating: number | null;
  totalRatingCount: number;
}): string | null {
  if (input.totalRating === null) return null;

  const count = input.totalRatingCount.toLocaleString("en-GB");
  const noun = input.totalRatingCount === 1 ? "rating" : "ratings";

  return `★ ${Math.round(input.totalRating)} · ${count} ${noun}`;
}

export function statusLabel(status: BacklogStatus): string {
  return STATUS_LABELS[status];
}

/** The prominent capsule doubles as the add affordance when untracked. */
export function statusButtonLabel(status: BacklogStatus | null): string {
  return status === null ? "Add to Backlog" : statusLabel(status);
}

export function ratingButtonLabel(rating: number | null): string {
  return rating === null ? "" : String(rating);
}

export function rowSubtitle(entry: { status: BacklogStatus; rating: number | null }): string {
  return entry.rating === null
    ? statusLabel(entry.status)
    : `${statusLabel(entry.status)} · ★${entry.rating}`;
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
