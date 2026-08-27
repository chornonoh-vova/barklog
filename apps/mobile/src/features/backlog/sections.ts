import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";

import { statusLabel } from "@/features/game/format";

/**
 * Display order for the Home list when All is selected: what you are playing
 * now, then what is next, then what is done with.
 *
 * Deliberately NOT `BACKLOG_STATUSES` from `@repo/contracts`, and deliberately
 * not added there either. That constant is the declaration order of the
 * Postgres enum and `packages/db`'s status-parity test depends on it —
 * reordering it to suit this screen would break the database contract. The
 * tempting one-line change is the wrong one.
 */
export const STATUS_ORDER = ["playing", "waiting", "completed", "abandoned"] as const;

export interface BacklogSection {
  status: BacklogStatus;
  /** `null` when a single status is filtered — the header renders nothing. */
  title: string | null;
  count: number;
  data: BacklogListItemWire[];
}

/**
 * Grouping happens on the client because the whole collection already arrives
 * unpaginated in one response (API design §8), so the sort is free — and
 * because this order is a property of this screen, not something the API should
 * grow a `sort=status` for.
 *
 * A filtered call returns one section with a null title, so `SectionList` is
 * the single code path for both cases rather than a branch between two list
 * components.
 */
export function toSections(
  items: BacklogListItemWire[],
  filter: BacklogStatus | undefined,
): BacklogSection[] {
  if (filter !== undefined) {
    return items.length === 0
      ? []
      : [{ status: filter, title: null, count: items.length, data: items }];
  }

  const grouped = new Map<BacklogStatus, BacklogListItemWire[]>();
  // Insertion order preserves what the API returned — `updated_at DESC` — so
  // the most recently touched game sits at the top of each section.
  for (const item of items) {
    const bucket = grouped.get(item.status);
    if (bucket) bucket.push(item);
    else grouped.set(item.status, [item]);
  }

  return STATUS_ORDER.flatMap((status) => {
    const data = grouped.get(status);
    if (!data) return [];

    return [{ status, title: statusLabel(status), count: data.length, data }];
  });
}
