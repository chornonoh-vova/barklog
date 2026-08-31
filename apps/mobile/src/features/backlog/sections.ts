import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";

import { statusLabel } from "@/features/game/format";

/**
 * Not `BACKLOG_STATUSES`: that is the Postgres enum's declaration order, and
 * reordering it to suit this screen would break the database contract.
 */
export const STATUS_ORDER = ["playing", "waiting", "completed", "abandoned"] as const;

export interface BacklogSection {
  status: BacklogStatus;
  title: string | null;
  count: number;
  data: BacklogListItemWire[];
}

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
