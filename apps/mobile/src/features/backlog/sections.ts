import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";

import { statusLabel } from "@/features/game/format";

/**
 * Playing, then what is next, then what is done with.
 *
 * Deliberately not `BACKLOG_STATUSES` from `@repo/contracts`: that constant is
 * the declaration order of the Postgres enum and `packages/db`'s status-parity
 * test depends on it, so reordering it here would break the database contract.
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
 * Grouped on the client because the whole collection arrives unpaginated in one
 * response, and because this order is a property of the screen rather than
 * something the API should grow a `sort=status` for. A filtered call returns one
 * section with a null title, so `SectionList` covers both cases.
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
  // Insertion order preserves the API's `updated_at DESC`.
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
