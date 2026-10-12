import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";

import { statusLabel } from "@/features/game/format";
import { chunk } from "@/ui/columns";

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

/** A section whose items are grouped into rows of cards for a wide window. */
export interface BacklogRowSection extends Omit<BacklogSection, "data"> {
  data: BacklogListItemWire[][];
}

/** `count` stays the number of games — it is what the header shows. */
export function toRowSections(sections: BacklogSection[], columns: number): BacklogRowSection[] {
  return sections.map((section) => ({ ...section, data: chunk(section.data, columns) }));
}
