/**
 * Coercions shared by the ladder's rungs. Neither belongs to a protocol:
 * `unknown` covers both a JSON number from oEmbed and an HTML attribute
 * string from Open Graph.
 */

export function toPositiveInt(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.round(parsed);
}

/** Handed straight to a client to load, so anything not https is dropped. */
export function httpsUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
