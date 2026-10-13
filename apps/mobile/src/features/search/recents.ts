export const RECENT_LIMIT = 8;

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** Newest first; a repeat moves to the top rather than appearing twice. */
export function pushRecent(list: readonly string[], query: string): string[] {
  const trimmed = query.trim();
  if (trimmed === "") return [...list];

  return [trimmed, ...list.filter((item) => !same(item, trimmed))].slice(0, RECENT_LIMIT);
}

/** Whatever is in storage, read defensively: anything unexpected is no recents. */
export function parseRecents(raw: string | null): string[] {
  if (raw === null || raw === "") return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is string => typeof item === "string" && item !== "")
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}
