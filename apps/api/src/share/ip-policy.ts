import { isIPv4, isIPv6 } from "node:net";

const V4_BLOCKED: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0000200, 24], // 192.0.2/24 (TEST-NET-1)
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15
  [0xc6336400, 24], // 198.51.100/24 (TEST-NET-2)
  [0xcb007100, 24], // 203.0.113/24 (TEST-NET-3)
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

const DOTTED_QUAD_TAIL = /:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/;

// A trailing dotted quad is two hextets' worth of value written as decimal
// octets. Rewriting it to hex up front means every group below comes from one
// uniform hextet parser, regardless of which spelling produced it.
function expandDottedTail(address: string): string | null {
  const match = DOTTED_QUAD_TAIL.exec(address);
  if (!match) return address;

  const value = toV4Int(match[1]!);
  if (value === null) return null;

  const high = ((value >>> 16) & 0xffff).toString(16);
  const low = (value & 0xffff).toString(16);
  return address.slice(0, match.index + 1) + high + ":" + low;
}

function parseHextets(part: string): number[] | null {
  if (part === "") return [];

  const values = part.split(":").map((h) => (/^[0-9a-fA-F]{1,4}$/.test(h) ? Number.parseInt(h, 16) : Number.NaN));
  return values.some((v) => Number.isNaN(v)) ? null : values;
}

// Expands any valid IPv6 address into exactly eight 16-bit groups by
// resolving "::" and any trailing dotted quad, so every later decision reads
// group values instead of matching on how the address happened to be spelled.
function toGroups(address: string): number[] | null {
  const withoutZone = address.split("%")[0]!;
  const expanded = expandDottedTail(withoutZone);
  if (expanded === null) return null;

  const parts = expanded.split("::");
  if (parts.length > 2) return null;

  if (parts.length === 1) {
    const groups = parseHextets(parts[0]!);
    return groups !== null && groups.length === 8 ? groups : null;
  }

  const head = parseHextets(parts[0]!);
  const tail = parseHextets(parts[1]!);
  if (head === null || tail === null) return null;

  const fillLength = 8 - head.length - tail.length;
  if (fillLength < 0) return null;

  return [...head, ...new Array<number>(fillLength).fill(0), ...tail];
}

function groupsToV4(high: number, low: number): string {
  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join(".");
}

export function isPublicUnicast(address: string, family: 4 | 6): boolean {
  if (family === 4) return isPublicV4(address);
  if (!isIPv6(address)) return false;

  const g = toGroups(address);
  if (g === null) return false;

  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
    return isPublicV4(groupsToV4(g[6]!, g[7]!)); // ::ffff:0:0/96
  }

  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return isPublicV4(groupsToV4(g[6]!, g[7]!)); // 64:ff9b::/96
  }

  if (g[0] === 0x2002) {
    return isPublicV4(groupsToV4(g[1]!, g[2]!)); // 2002::/16
  }

  const isUnspecified = g.every((v) => v === 0);
  const isLoopback = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && g[6] === 0 && g[7] === 1;
  const firstSixZero = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0;

  if (isUnspecified || isLoopback) return false;
  if (firstSixZero) return isPublicV4(groupsToV4(g[6]!, g[7]!)); // legacy IPv4-compatible ::a.b.c.d

  const head = g[0]!;
  if ((head & 0xfe00) === 0xfc00) return false; // fc00::/7
  if ((head & 0xffc0) === 0xfe80) return false; // fe80::/10
  if ((head & 0xff00) === 0xff00) return false; // ff00::/8

  return true;
}
