import { isIPv4, isIPv6 } from "node:net";

/** [firstOctetMask, matcher] pairs are not worth it; ranges read better. */
const V4_BLOCKED: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15
  [0xe0000000, 4], // 224/4
  [0xf0000000, 4], // 240/4
];

function toV4Int(address: string): number | null {
  if (!isIPv4(address)) return null;

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }

  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function isPublicV4(address: string): boolean {
  const value = toV4Int(address);
  if (value === null) return false;

  return !V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === base;
  });
}

/**
 * `::ffff:a.b.c.d` and NAT64 `64:ff9b::a.b.c.d` are IPv4 in an IPv6 coat.
 * Missing this is a complete bypass of the v4 table, not a partial one.
 */
function embeddedV4(address: string): string | null {
  const lower = address.toLowerCase();

  for (const prefix of ["::ffff:", "64:ff9b::"]) {
    if (!lower.startsWith(prefix)) continue;

    const tail = lower.slice(prefix.length);
    if (isIPv4(tail)) return tail;

    const groups = tail.split(":");
    if (groups.length !== 2) continue;

    const high = Number.parseInt(groups[0]!, 16);
    const low = Number.parseInt(groups[1]!, 16);
    if (Number.isNaN(high) || Number.isNaN(low)) continue;

    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }

  return null;
}

export function isPublicUnicast(address: string, family: 4 | 6): boolean {
  if (family === 4) return isPublicV4(address);
  if (!isIPv6(address)) return false;

  const mapped = embeddedV4(address);
  if (mapped !== null) return isPublicV4(mapped);

  const lower = address.toLowerCase();
  if (lower === "::" || lower === "::1") return false;

  const head = Number.parseInt(lower.split(":")[0] || "0", 16);
  if (Number.isNaN(head)) return false;

  if ((head & 0xfe00) === 0xfc00) return false; // fc00::/7
  if ((head & 0xffc0) === 0xfe80) return false; // fe80::/10
  if ((head & 0xff00) === 0xff00) return false; // ff00::/8

  return true;
}
