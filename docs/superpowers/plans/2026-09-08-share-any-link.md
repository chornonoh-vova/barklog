# Share Any Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept any https link at `POST /games/identify`, squeeze metadata out of it via oEmbed then Open Graph, and let the model escalate to a web search when the metadata alone cannot name a game.

**Architecture:** Host allowlist dies. Network-layer guard replaces it — DNS pinned inside undici's `connect.lookup`, public unicast only. Metadata comes from a 4-rung ladder. Extraction splits in two passes: cheap classify, then `web_search` only on `none`.

**Tech Stack:** Hono, valibot, undici (Node 22 built-in fetch), `htmlparser2` v12, OpenAI Responses API (`gpt-5.4-mini`), vitest, React Native / Expo, `@tanstack/react-query`.

**Spec:** `docs/superpowers/specs/2026-09-08-share-any-link-design.md`

## Global Constraints

- **Comments: minimum.** Only non-obvious or critical. No comment restating what code says. Existing dense-comment style in `apps/api/src/share/*` does NOT apply to new code. Keep an existing comment only when it records a reason the code cannot show — e.g. why oEmbed `minLength(1)` exists.
- **Every outbound request goes through `safeFetch`.** No bare `fetch` in `apps/api/src/share/`. oEmbed endpoints included.
- **No new runtime dep beyond `htmlparser2` ^12.0.0.**
- Node built-in `fetch`/undici. No axios, no node-fetch.
- valibot for all parsing. Import style `import * as v from "valibot"`.
- `EXTRACT_PROMPT_VERSION = 3`. Bump again on any prompt edit.
- Reasoning effort: pass 1 `none`, pass 2 `low`. Never `minimal`.
- Test runner `vitest run`. Root: `pnpm test`, `pnpm check-types`, `pnpm lint`.
- Commit per task. Conventional commits.
- User-facing copy is written out verbatim in each task. Use it exactly.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/api/src/share/safe-fetch.ts` | Only outbound path. DNS pin, address policy, redirects, byte cap. |
| `apps/api/src/share/ip-policy.ts` | Pure address predicate. Split from safe-fetch so it tests without sockets. |
| `apps/api/src/share/normalise.ts` | Pure URL canonicalisation → `{ url, shareId, sourceId }`. Replaces `canonicalise.ts`. |
| `apps/api/src/share/providers.generated.ts` | Committed snapshot of oembed.com providers. |
| `apps/api/src/share/provider-match.ts` | Scheme glob → anchored regex, and the lookup. |
| `apps/api/src/share/oembed.ts` | One rung. Any endpoint. |
| `apps/api/src/share/opengraph.ts` | One rung. HTML → og/title. |
| `apps/api/src/share/meta.ts` | Sequences the rungs. Owns the two floors. |
| `apps/api/src/share/extract.ts` | Two-pass extractor. |
| `apps/api/scripts/refresh-oembed-providers.ts` | Regenerates the snapshot. Dev-time only. |
| `apps/mobile/src/features/share/host.ts` | Pure. `pageUrl` → display host. |
| `apps/mobile/src/features/share/searching-state.tsx` | Mascot + spinner + copy. |

---

## Task 1: Probe web_search with strict json_schema

Spec §8 open question. Undocumented combination. Settle before building on it.

**Files:**
- Create: `/tmp/probe-websearch.mjs` (throwaway, never committed)

**Interfaces:**
- Produces: a yes/no that decides Task 7's pass-2 shape.

- [ ] **Step 1: Write the probe**

```js
// /tmp/probe-websearch.mjs
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.responses.create({
  model: "gpt-5.4-mini",
  instructions: "Identify the video game the linked page is about. Search the web.",
  input: "URL: https://www.ign.com/articles/hollow-knight-silksong-review",
  max_output_tokens: 1024,
  reasoning: { effort: "low" },
  tools: [{ type: "web_search", search_context_size: "low" }],
  text: {
    format: {
      type: "json_schema",
      name: "game_titles",
      strict: true,
      schema: {
        type: "object",
        properties: {
          titles: { type: "array", items: { type: "string" } },
          basis: { type: "string", enum: ["web", "none"] },
        },
        required: ["titles", "basis"],
        additionalProperties: false,
      },
    },
  },
});

console.log("output_text:", response.output_text);
console.log("parsed:", JSON.parse(response.output_text));
console.log("usage:", response.usage);
console.log("items:", response.output.map((i) => i.type));
```

- [ ] **Step 2: Run it**

```bash
OPENAI_API_KEY=$(grep OPENAI_API_KEY apps/api/.env | cut -d= -f2-) node /tmp/probe-websearch.mjs
```

Expected if supported: `parsed` prints an object, `items` includes `web_search_call` and `message`.
Expected if not: a 400, or `output_text` that is not JSON.

- [ ] **Step 3: Record the verdict**

Append one line to the spec under §8 "The unverified assumption":

```
**Probe result (2026-09-08):** combination works / does not work. Pass 2 uses the single-call / split-call shape.
```

If it does NOT work, Task 7 changes: pass 2 becomes two calls — a `web_search` call with no `text.format`, then pass 1's structured call over the prose. Every other task is unaffected.

- [ ] **Step 4: Commit the spec note**

```bash
git add docs/superpowers/specs/2026-09-08-share-any-link-design.md
git commit -m "docs: record web_search + json_schema probe result"
```

---

## Task 2: Address policy

Pure predicate. No sockets. Tests exhaustively.

**Files:**
- Create: `apps/api/src/share/ip-policy.ts`
- Test: `apps/api/test/share-ip-policy.test.ts`

**Interfaces:**
- Produces: `isPublicUnicast(address: string, family: 4 | 6): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/share-ip-policy.test.ts
import { expect, test } from "vitest";

import { isPublicUnicast } from "../src/share/ip-policy.js";

test.each([
  ["93.184.216.34", 4],
  ["1.1.1.1", 4],
  ["2606:4700:4700::1111", 6],
] as const)("accepts public %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(true);
});

test.each([
  ["0.0.0.1", 4],
  ["10.1.2.3", 4],
  ["100.64.0.1", 4],
  ["127.0.0.1", 4],
  ["169.254.169.254", 4],
  ["172.16.0.1", 4],
  ["172.31.255.255", 4],
  ["192.0.0.1", 4],
  ["192.168.1.1", 4],
  ["198.18.0.1", 4],
  ["224.0.0.1", 4],
  ["240.0.0.1", 4],
  ["255.255.255.255", 4],
] as const)("refuses ipv4 %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(false);
});

test.each([
  ["::", 6],
  ["::1", 6],
  ["fc00::1", 6],
  ["fd12:3456::1", 6],
  ["fe80::1", 6],
  ["ff02::1", 6],
] as const)("refuses ipv6 %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(false);
});

// The bypass that matters: loopback wearing an IPv6 hat.
test.each([
  ["::ffff:127.0.0.1", 6],
  ["::ffff:10.0.0.5", 6],
  ["::ffff:7f00:1", 6],
  ["64:ff9b::127.0.0.1", 6],
  ["64:ff9b::a00:5", 6],
] as const)("unwraps and refuses %s", (address, family) => {
  expect(isPublicUnicast(address, family)).toBe(false);
});

test("unwraps a mapped public address and accepts it", () => {
  expect(isPublicUnicast("::ffff:93.184.216.34", 6)).toBe(true);
});

test("refuses anything unparseable", () => {
  expect(isPublicUnicast("not-an-address", 4)).toBe(false);
  expect(isPublicUnicast("", 6)).toBe(false);
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
pnpm --filter api exec vitest run test/share-ip-policy.test.ts
```

Expected: FAIL, cannot resolve `../src/share/ip-policy.js`.

> **Superseded during execution.** The reference implementation below was
> exploitable: it detected IPv4-in-IPv6 by string prefix, so `::ffff:127.0.0.1`
> was refused but `0::ffff:127.0.0.1`, `::127.0.0.1`, `::10.0.0.5` and
> `2002:7f00:0001::` all reached loopback or RFC1918. Three fix rounds replaced
> it. The shipped design is an **allowlist**: parse to eight 16-bit groups,
> refuse anything outside global unicast `2000::/3`, then carve out 6to4
> (unwrap and re-check the v4 table), Teredo `2001:0000::/32`, `2001:db8::/32`
> and `3fff::/20`. Read `apps/api/src/share/ip-policy.ts` and
> `.superpowers/sdd/2026-09-08-share-any-link/task-2-report.md`, not the block
> below, which is kept only so the rulings have something to refer to.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/share/ip-policy.ts
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
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter api exec vitest run test/share-ip-policy.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/share/ip-policy.ts apps/api/test/share-ip-policy.test.ts
git commit -m "feat(share): add public-unicast address policy"
```

---

## Task 3: safeFetch

Wraps `ip-policy`. DNS pinned inside the agent's lookup so the socket cannot reach an address the check did not see.

**Files:**
- Create: `apps/api/src/share/safe-fetch.ts`
- Test: `apps/api/test/share-safe-fetch.test.ts`

**Interfaces:**
- Consumes: `isPublicUnicast` (Task 2), `isShareableUrl` (Step 0 below)
- Produces:
  ```ts
  export const MAX_REDIRECTS = 3;
  export const HOP_TIMEOUT_MS = 5_000;
  export const LADDER_BUDGET_MS = 8_000;
  export class BlockedAddress extends Error {}
  export class FetchRefused extends Error {}
  export interface SafeResponse { status: number; headers: Headers; body: string; finalUrl: string }
  export function safeFetch(url: string, options: {
    allow: readonly string[];
    maxBytes: number;
    deadline: number;
    lookup?: LookupFn;
    fetchImpl?: typeof fetch;
  }): Promise<SafeResponse>;
  export type LookupFn = (hostname: string) => Promise<{ address: string; family: 4 | 6 }[]>;
  ```

- [ ] **Step 0: Add the shared url-shape check to contracts**

One implementation, used by `safeFetch`, by `normaliseShare`, and by the request schema. Add to `packages/contracts/src/share.ts` and export it:

```ts
/**
 * Shape only. The outbound request is guarded at the network layer instead —
 * see `apps/api/src/share/safe-fetch.ts`.
 */
export function isShareableUrl(input: string): boolean {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.port !== "" && url.port !== "443") return false;

  return true;
}
```

```bash
pnpm --filter @repo/contracts build
```

Task 7 wires it into `shareIdentifySchema`; this step only adds the function.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/share-safe-fetch.test.ts
import { expect, test, vi } from "vitest";

import { BlockedAddress, FetchRefused, safeFetch } from "../src/share/safe-fetch.js";

const PUBLIC = async () => [{ address: "93.184.216.34", family: 4 as const }];
const PRIVATE = async () => [{ address: "10.0.0.5", family: 4 as const }];

function jsonResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const opts = { allow: ["application/json"], maxBytes: 65_536, deadline: Date.now() + 8_000 };

test("returns the body and the final url", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse('{"ok":true}'));

  const result = await safeFetch("https://example.test/a", {
    ...opts,
    lookup: PUBLIC,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  expect(result.body).toBe('{"ok":true}');
  expect(result.finalUrl).toBe("https://example.test/a");
});

test("refuses a host that resolves to a private address", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse("{}"));

  await expect(
    safeFetch("https://internal.test/a", {
      ...opts,
      lookup: PRIVATE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow(BlockedAddress);

  expect(fetchImpl).not.toHaveBeenCalled();
});

test("refuses when any resolved address is private", async () => {
  const mixed = async () => [
    { address: "93.184.216.34", family: 4 as const },
    { address: "127.0.0.1", family: 4 as const },
  ];

  await expect(
    safeFetch("https://rebind.test/a", {
      ...opts,
      lookup: mixed,
      fetchImpl: (async () => jsonResponse("{}")) as unknown as typeof fetch,
    }),
  ).rejects.toThrow(BlockedAddress);
});

test("follows redirects and reports the last url", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://b.test/final" } }),
    )
    .mockResolvedValueOnce(jsonResponse('{"n":2}'));

  const result = await safeFetch("https://a.test/start", {
    ...opts,
    lookup: PUBLIC,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  expect(result.finalUrl).toBe("https://b.test/final");
  expect(result.body).toBe('{"n":2}');
});

test("re-checks the address on every hop", async () => {
  const lookup = vi
    .fn()
    .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 as const }])
    .mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 as const }]);

  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://meta.test/latest" } }),
    );

  await expect(
    safeFetch("https://a.test/start", {
      ...opts,
      lookup,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow(BlockedAddress);
});

test("refuses a redirect that leaves https", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "http://a.test/downgrade" } }),
    );

  await expect(
    safeFetch("https://a.test/start", {
      ...opts,
      lookup: PUBLIC,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow(FetchRefused);
});

test("gives up after MAX_REDIRECTS hops", async () => {
  const fetchImpl = vi.fn(
    async () => new Response(null, { status: 302, headers: { location: "https://a.test/loop" } }),
  );

  await expect(
    safeFetch("https://a.test/loop", {
      ...opts,
      lookup: PUBLIC,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow(FetchRefused);

  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

test("refuses a body past maxBytes", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse("x".repeat(200)));

  await expect(
    safeFetch("https://a.test/big", {
      ...opts,
      maxBytes: 64,
      lookup: PUBLIC,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow(FetchRefused);
});

test("refuses a content-type the caller did not ask for", async () => {
  const fetchImpl = vi.fn(
    async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
  );

  await expect(
    safeFetch("https://a.test/page", {
      ...opts,
      lookup: PUBLIC,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow(FetchRefused);
});

test("refuses once the deadline has passed", async () => {
  await expect(
    safeFetch("https://a.test/a", {
      ...opts,
      deadline: Date.now() - 1,
      lookup: PUBLIC,
      fetchImpl: (async () => jsonResponse("{}")) as unknown as typeof fetch,
    }),
  ).rejects.toThrow(FetchRefused);
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
pnpm --filter api exec vitest run test/share-safe-fetch.test.ts
```

Expected: FAIL, cannot resolve `../src/share/safe-fetch.js`.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/share/safe-fetch.ts
import { lookup as dnsLookup } from "node:dns/promises";
import { Agent } from "undici";

import { isShareableUrl } from "@repo/contracts";

import { isPublicUnicast } from "./ip-policy.js";

export const MAX_REDIRECTS = 3;
export const HOP_TIMEOUT_MS = 5_000;
export const LADDER_BUDGET_MS = 8_000;

export class BlockedAddress extends Error {
  override readonly name = "BlockedAddress";
}

export class FetchRefused extends Error {
  override readonly name = "FetchRefused";
}

export interface SafeResponse {
  status: number;
  headers: Headers;
  body: string;
  finalUrl: string;
}

export type LookupFn = (hostname: string) => Promise<{ address: string; family: 4 | 6 }[]>;

const defaultLookup: LookupFn = async (hostname) => {
  const entries = await dnsLookup(hostname, { all: true, verbatim: true });
  return entries.map((entry) => ({ address: entry.address, family: entry.family as 4 | 6 }));
};

async function assertAddressAllowed(hostname: string, lookup: LookupFn): Promise<string> {
  let entries: { address: string; family: 4 | 6 }[];
  try {
    entries = await lookup(hostname);
  } catch (cause) {
    throw new FetchRefused(`could not resolve ${hostname}`, { cause });
  }

  if (entries.length === 0) throw new FetchRefused(`no addresses for ${hostname}`);

  // Every answer, not the first: a resolver returning one public and one
  // private address must not be usable by picking the private one.
  for (const entry of entries) {
    if (!isPublicUnicast(entry.address, entry.family)) {
      throw new BlockedAddress(`${hostname} resolves to a blocked address`);
    }
  }

  return entries[0]!.address;
}

/**
 * The address is pinned into the agent's own lookup, so the socket connects to
 * the address that passed the check. Checking and then calling
 * `fetch(hostname)` re-resolves at connect time and is rebindable.
 */
function pinnedAgent(address: string): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, address, address.includes(":") ? 6 : 4);
      },
    },
  });
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new FetchRefused(`body exceeded ${maxBytes} bytes`);
    }

    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function safeFetch(
  url: string,
  options: {
    /** Acceptable content-type prefixes. The first is what we send in `Accept`. */
    allow: readonly string[];
    maxBytes: number;
    deadline: number;
    lookup?: LookupFn;
    fetchImpl?: typeof fetch;
  },
): Promise<SafeResponse> {
  const lookup = options.lookup ?? defaultLookup;
  const fetchImpl = options.fetchImpl ?? fetch;

  let current = url;

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    if (Date.now() >= options.deadline) throw new FetchRefused("ladder budget exhausted");
    if (!isShareableUrl(current)) throw new FetchRefused(`refused url: ${current}`);

    const address = await assertAddressAllowed(new URL(current).hostname, lookup);
    const dispatcher = pinnedAgent(address);

    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: options.allow.join(", ") },
        signal: AbortSignal.timeout(
          Math.min(HOP_TIMEOUT_MS, Math.max(1, options.deadline - Date.now())),
        ),
        // @ts-expect-error undici accepts `dispatcher`; the DOM lib types do not.
        dispatcher,
      });
    } catch (cause) {
      throw new FetchRefused(`request failed for ${current}`, { cause });
    } finally {
      void dispatcher.close().catch(() => {});
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      void response.body?.cancel().catch(() => {});

      if (location === null) throw new FetchRefused("redirect without a location");

      try {
        current = new URL(location, current).toString();
      } catch {
        throw new FetchRefused("redirect location is not a url");
      }

      if (!isShareableUrl(current)) throw new FetchRefused(`redirect to ${current}`);
      continue;
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (response.ok && !options.allow.some((type) => contentType.includes(type))) {
      void response.body?.cancel().catch(() => {});
      throw new FetchRefused(`unexpected content-type: ${contentType}`);
    }

    return {
      status: response.status,
      headers: response.headers,
      body: response.ok ? await readCapped(response, options.maxBytes) : "",
      finalUrl: current,
    };
  }

  throw new FetchRefused(`more than ${MAX_REDIRECTS} redirects`);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter api exec vitest run test/share-safe-fetch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/share/safe-fetch.ts apps/api/test/share-safe-fetch.test.ts
git commit -m "feat(share): add pinned-address safe fetch"
```

---

## Task 4: normalise

Pure. Replaces `canonicalise.ts`. Keeps YouTube/TikTok rebuilds; drops the provider union.

**Files:**
- Create: `apps/api/src/share/normalise.ts`
- Delete: `apps/api/src/share/canonicalise.ts`
- Test: rename `apps/api/test/share-canonicalise.test.ts` → `apps/api/test/share-normalise.test.ts`

**Interfaces:**
- Consumes: `isShareableUrl` from `@repo/contracts`, `sha1` from `../cache-keys.js`
- Produces:
  ```ts
  export interface NormalisedShare { url: string; shareId: string; sourceId: string | null }
  export function normaliseShare(input: string): NormalisedShare | null;
  ```
  `null` means refuse — the route turns it into a 422.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/share-normalise.test.ts
import { expect, test } from "vitest";

import { normaliseShare } from "../src/share/normalise.js";

test("refuses non-https, userinfo, odd ports, and junk", () => {
  expect(normaliseShare("http://www.youtube.com/watch?v=1vs0lLIRt7w")).toBeNull();
  expect(normaliseShare("https://u:p@example.test/a")).toBeNull();
  expect(normaliseShare("https://example.test:8443/a")).toBeNull();
  expect(normaliseShare("not a url")).toBeNull();
  expect(normaliseShare("")).toBeNull();
});

test("rebuilds youtube urls and reports the video id", () => {
  const watch = normaliseShare("https://www.youtube.com/watch?v=1vs0lLIRt7w&t=42&si=abc");
  expect(watch?.url).toBe("https://www.youtube.com/watch?v=1vs0lLIRt7w");
  expect(watch?.sourceId).toBe("1vs0lLIRt7w");

  expect(normaliseShare("https://youtu.be/1vs0lLIRt7w")?.url).toBe(
    "https://www.youtube.com/watch?v=1vs0lLIRt7w",
  );
  expect(normaliseShare("https://www.youtube.com/shorts/abcdefghijk")?.url).toBe(
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  expect(normaliseShare("https://m.youtube.com/watch?v=1vs0lLIRt7w")?.url).toBe(
    "https://www.youtube.com/watch?v=1vs0lLIRt7w",
  );
});

test("rebuilds tiktok video urls and reports the video id", () => {
  const url = "https://www.tiktok.com/@creator/video/7123456789012345678?is_from_webapp=1";
  expect(normaliseShare(url)?.url).toBe("https://www.tiktok.com/@creator/video/7123456789012345678");
  expect(normaliseShare(url)?.sourceId).toBe("7123456789012345678");
});

test("passes other hosts through with tracking stripped and no sourceId", () => {
  const result = normaliseShare(
    "https://WWW.IGN.com/articles/a-review?utm_source=x&ref=y&keep=1#top",
  );

  expect(result?.url).toBe("https://www.ign.com/articles/a-review?keep=1");
  expect(result?.sourceId).toBeNull();
});

test("gives the same shareId to two spellings of one video", () => {
  const a = normaliseShare("https://youtu.be/1vs0lLIRt7w?t=9");
  const b = normaliseShare("https://www.youtube.com/watch?v=1vs0lLIRt7w");

  expect(a?.shareId).toBe(b?.shareId);
});

test("gives different shareIds to different urls", () => {
  const a = normaliseShare("https://www.ign.com/a");
  const b = normaliseShare("https://www.ign.com/b");

  expect(a?.shareId).not.toBe(b?.shareId);
});

test("keeps a short link intact so the ladder can resolve it", () => {
  const result = normaliseShare("https://vm.tiktok.com/ZMabcdef/");

  expect(result?.url).toBe("https://vm.tiktok.com/ZMabcdef/");
  expect(result?.sourceId).toBeNull();
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
pnpm --filter api exec vitest run test/share-normalise.test.ts
```

Expected: FAIL, cannot resolve `../src/share/normalise.js`.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/share/normalise.ts
import { sha1 } from "../cache-keys.js";
import { isShareableUrl } from "@repo/contracts";


export interface NormalisedShare {
  url: string;
  shareId: string;
  /** Provider-native id, for the two hosts we rebuild by hand. oEmbed carries no id. */
  sourceId: string | null;
}

const TRACKING = new Set(["si", "t", "ref", "fbclid", "igsh", "is_from_webapp", "sender_device"]);

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const YOUTUBE_ID = /^[\w-]{11}$/;
const TIKTOK_ID = /^\d{6,25}$/;

function segments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

function youtubeId(url: URL): string | null {
  const parts = segments(url);

  if (url.hostname.toLowerCase() === "youtu.be") return parts[0] ?? null;
  if (parts[0] === "shorts") return parts[1] ?? null;
  if (url.pathname === "/watch") return url.searchParams.get("v");

  return null;
}

function stripTracking(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.has(key) || key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  }
}

function finish(url: string, sourceId: string | null): NormalisedShare {
  return { url, shareId: sha1(url), sourceId };
}

export function normaliseShare(input: string): NormalisedShare | null {
  if (!isShareableUrl(input)) return null;

  const url = new URL(input);
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  stripTracking(url);

  if (YOUTUBE_HOSTS.has(url.hostname)) {
    const videoId = youtubeId(url);
    if (videoId === null || !YOUTUBE_ID.test(videoId)) return finish(url.toString(), null);

    return finish(`https://www.youtube.com/watch?v=${videoId}`, videoId);
  }

  if (url.hostname === "tiktok.com" || url.hostname === "www.tiktok.com") {
    const [creator, kind, videoId] = segments(url);

    if (creator?.startsWith("@") === true && kind === "video" && videoId !== undefined) {
      if (!TIKTOK_ID.test(videoId)) return finish(url.toString(), null);

      return finish(`https://www.tiktok.com/${creator}/video/${videoId}`, videoId);
    }
  }

  return finish(url.toString(), null);
}
```

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter api exec vitest run test/share-normalise.test.ts
```

Expected: PASS.

- [ ] **Step 5: Delete the old module and its test**

```bash
git rm apps/api/src/share/canonicalise.ts apps/api/test/share-canonicalise.test.ts
```

`pnpm --filter api check-types` will now fail in `games.ts`, `types.ts` and `provider.ts`. Expected. Task 9 fixes it.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/share/normalise.ts apps/api/test/share-normalise.test.ts
git commit -m "feat(share): replace canonicalise with url normalise"
```

---

## Task 5: Provider snapshot and scheme matching

**Files:**
- Create: `apps/api/scripts/refresh-oembed-providers.ts`
- Create: `apps/api/src/share/providers.generated.ts` (by running the script)
- Create: `apps/api/src/share/provider-match.ts`
- Test: `apps/api/test/share-provider-match.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ProviderEntry { name: string; endpoint: string; schemes: string[] }
  export const PROVIDERS: readonly ProviderEntry[];              // providers.generated.ts
  export function schemeToRegExp(scheme: string): RegExp;        // provider-match.ts
  export function matchProvider(url: string): ProviderEntry | null;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/share-provider-match.test.ts
import { expect, test } from "vitest";

import { matchProvider, schemeToRegExp } from "../src/share/provider-match.js";

test("anchors the pattern so a lookalike host cannot match", () => {
  const pattern = schemeToRegExp("https://*.youtube.com/watch*");

  expect(pattern.test("https://www.youtube.com/watch?v=abc")).toBe(true);
  expect(pattern.test("https://a.youtube.com.evil.test/watch?v=abc")).toBe(false);
  expect(pattern.test("https://evil.test/?u=https://www.youtube.com/watch?v=abc")).toBe(false);
});

test("a host wildcard spans one label, not a path", () => {
  const pattern = schemeToRegExp("https://*.flickr.com/photos/*");

  expect(pattern.test("https://www.flickr.com/photos/12345")).toBe(true);
  expect(pattern.test("https://flickr.com/photos/12345")).toBe(false);
});

test("a trailing wildcard swallows the query", () => {
  const pattern = schemeToRegExp("https://vimeo.com/*");

  expect(pattern.test("https://vimeo.com/123456789")).toBe(true);
  expect(pattern.test("https://vimeo.com/123456789?share=copy")).toBe(true);
});

test("escapes regex metacharacters in the literal parts", () => {
  const pattern = schemeToRegExp("https://example.test/a.b+c/*");

  expect(pattern.test("https://example.test/a.b+c/x")).toBe(true);
  expect(pattern.test("https://example.test/aXbYc/x")).toBe(false);
});

test("finds real providers from the snapshot", () => {
  expect(matchProvider("https://www.youtube.com/watch?v=1vs0lLIRt7w")?.name).toBe("YouTube");
  expect(matchProvider("https://www.tiktok.com/@u/video/7123456789012345678")?.name).toBe("TikTok");
  expect(matchProvider("https://vimeo.com/123456789")?.name).toBe("Vimeo");
});

test("returns null for a page no provider claims", () => {
  expect(matchProvider("https://www.ign.com/articles/a-review")).toBeNull();
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
pnpm --filter api exec vitest run test/share-provider-match.test.ts
```

Expected: FAIL, cannot resolve `../src/share/provider-match.js`.

- [ ] **Step 3: Write the refresh script**

```ts
// apps/api/scripts/refresh-oembed-providers.ts
import { writeFile } from "node:fs/promises";

interface RawEndpoint {
  url?: string;
  schemes?: string[];
}

interface RawProvider {
  provider_name?: string;
  endpoints?: RawEndpoint[];
}

const SOURCE = "https://oembed.com/providers.json";
const TARGET = new URL("../src/share/providers.generated.ts", import.meta.url);

const response = await fetch(SOURCE, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`providers.json answered ${response.status}`);

const raw = (await response.json()) as RawProvider[];

const entries = raw.flatMap((provider) =>
  (provider.endpoints ?? []).flatMap((endpoint) => {
    const url = endpoint.url?.replace("{format}", "json");
    const schemes = (endpoint.schemes ?? []).filter((scheme) => scheme.startsWith("https://"));

    if (url === undefined || !url.startsWith("https://") || schemes.length === 0) return [];

    return [{ name: provider.provider_name ?? new URL(url).hostname, endpoint: url, schemes }];
  }),
);

const body = `// Generated by scripts/refresh-oembed-providers.ts. Do not edit.
// Source: ${SOURCE}
// Refreshed: ${new Date().toISOString().slice(0, 10)}

export interface ProviderEntry {
  name: string;
  endpoint: string;
  schemes: string[];
}

export const PROVIDERS: readonly ProviderEntry[] = ${JSON.stringify(entries, null, 2)};
`;

await writeFile(TARGET, body, "utf8");
console.log(`wrote ${entries.length} provider endpoints`);
```

- [ ] **Step 4: Run it, then format the output**

```bash
pnpm --filter api exec tsx scripts/refresh-oembed-providers.ts
pnpm exec prettier --write apps/api/src/share/providers.generated.ts
```

Expected: prints a count in the hundreds. Confirm YouTube, TikTok and Vimeo are present:

```bash
grep -c '"endpoint"' apps/api/src/share/providers.generated.ts
grep -o '"name": "\(YouTube\|TikTok\|Vimeo\)"' apps/api/src/share/providers.generated.ts | sort -u
```

- [ ] **Step 5: Implement the matcher**

```ts
// apps/api/src/share/provider-match.ts
import { PROVIDERS, type ProviderEntry } from "./providers.generated.js";

export type { ProviderEntry };

/**
 * `*` spans one path or host label, except a trailing `*`, which takes the
 * rest including the query. Anchored, and `[^/]*` rather than `.*` in the
 * host: `.*` would let `a.youtube.com.evil.test` match `*.youtube.com`.
 */
export function schemeToRegExp(scheme: string): RegExp {
  const trailing = scheme.endsWith("*");
  const core = trailing ? scheme.slice(0, -1) : scheme;

  const body = core
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");

  return new RegExp(`^${body}${trailing ? ".*" : ""}$`, "i");
}

const COMPILED = PROVIDERS.map((provider) => ({
  provider,
  patterns: provider.schemes.map(schemeToRegExp),
}));

export function matchProvider(url: string): ProviderEntry | null {
  for (const { provider, patterns } of COMPILED) {
    if (patterns.some((pattern) => pattern.test(url))) return provider;
  }

  return null;
}
```

- [ ] **Step 6: Run tests, verify pass**

```bash
pnpm --filter api exec vitest run test/share-provider-match.test.ts
```

Expected: PASS. If the Vimeo assertion fails, check the snapshot for Vimeo's actual scheme and adjust the test URL to a real one — do not loosen the matcher.

- [ ] **Step 7: Commit**

```bash
git add apps/api/scripts/refresh-oembed-providers.ts apps/api/src/share/providers.generated.ts \
        apps/api/src/share/provider-match.ts apps/api/test/share-provider-match.test.ts
git commit -m "feat(share): vendor oembed providers and match schemes"
```

---

## Task 6: The metadata ladder

Three files. `oembed.ts` and `opengraph.ts` are rungs; `meta.ts` sequences them and owns the two floors.

**Files:**
- Modify: `apps/api/src/share/oembed.ts` (rewrite)
- Create: `apps/api/src/share/opengraph.ts`
- Create: `apps/api/src/share/meta.ts`
- Modify: `apps/api/package.json` (add `htmlparser2`)
- Test: rewrite `apps/api/test/share-oembed.test.ts`, create `apps/api/test/share-opengraph.test.ts`, `apps/api/test/share-meta.test.ts`

**Interfaces:**
- Consumes: `safeFetch`, `FetchRefused` (Task 3); `NormalisedShare`, `normaliseShare` (Task 4); `matchProvider` (Task 5)
- Produces:
  ```ts
  // oembed.ts
  export class SourceGone extends Error {}
  export class SourceUnavailable extends Error {}
  export interface SourceMeta {
    title: string;
    author: string | null;
    provider: string;
    pageUrl: string;
    shareId: string;
    thumbnailUrl: string | null;
    thumbnailWidth: number | null;
    thumbnailHeight: number | null;
  }
  export function httpsUrlOrNull(value: unknown): string | null;
  export function fetchOembed(endpoint: string, url: string, deadline: number, fetchImpl?: typeof fetch): Promise<Omit<SourceMeta, "shareId">>;

  // opengraph.ts
  export interface PageMeta { title: string; siteName: string | null; imageUrl: string | null; imageWidth: number | null; imageHeight: number | null }
  export function parseOpenGraph(html: string): PageMeta | null;
  export function fetchPage(url: string, deadline: number, fetchImpl?: typeof fetch): Promise<{ html: string; finalUrl: string }>;

  // meta.ts
  export class SourceUnreadable extends Error {}
  export function fetchSourceMeta(share: NormalisedShare, fetchImpl?: typeof fetch): Promise<SourceMeta>;
  ```

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter api add htmlparser2@^12.0.0
```

- [ ] **Step 2: Write the failing oEmbed test**

```ts
// apps/api/test/share-oembed.test.ts
import { expect, test, vi } from "vitest";

import { fetchOembed, SourceGone, SourceUnavailable } from "../src/share/oembed.js";

const ENDPOINT = "https://www.youtube.com/oembed";
const PAGE = "https://www.youtube.com/watch?v=1vs0lLIRt7w";

function ok(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const deadline = () => Date.now() + 8_000;

test("reads title, author, provider and thumbnail dimensions", async () => {
  const fetchImpl = vi.fn(async () =>
    ok({
      title: "  Can You Beat Resident Evil 2 WITHOUT Killing Anything?  ",
      author_name: " Snamwiches ",
      provider_name: "YouTube",
      thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg",
      thumbnail_width: 480,
      thumbnail_height: 360,
    }),
  );

  expect(await fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch)).toEqual({
    title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
    author: "Snamwiches",
    provider: "YouTube",
    pageUrl: PAGE,
    thumbnailUrl: "https://i.ytimg.com/vi/x/hqdefault.jpg",
    thumbnailWidth: 480,
    thumbnailHeight: 360,
  });
});

test("drops a non-https thumbnail rather than forwarding it", async () => {
  const fetchImpl = vi.fn(async () =>
    ok({ title: "A", provider_name: "P", thumbnail_url: "http://cdn.test/a.jpg" }),
  );

  const meta = await fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch);
  expect(meta.thumbnailUrl).toBeNull();
  expect(meta.thumbnailWidth).toBeNull();
});

test("treats a blank title as gone, which is TikTok's answer for a removed video", async () => {
  const fetchImpl = vi.fn(async () => ok({ title: "   ", provider_name: "TikTok" }));

  await expect(
    fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch),
  ).rejects.toThrow(SourceUnavailable);
});

test.each([401, 403, 404])("maps %i to SourceGone", async (status) => {
  const fetchImpl = vi.fn(async () => new Response(null, { status }));

  await expect(
    fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch),
  ).rejects.toThrow(SourceGone);
});

test("maps 500 to SourceUnavailable so the ladder can fall through", async () => {
  const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

  await expect(
    fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch),
  ).rejects.toThrow(SourceUnavailable);
});

test("maps a payload that does not match the schema to SourceUnavailable", async () => {
  const fetchImpl = vi.fn(async () => ok({ nope: true }));

  await expect(
    fetchOembed(ENDPOINT, PAGE, deadline(), fetchImpl as unknown as typeof fetch),
  ).rejects.toThrow(SourceUnavailable);
});
```

- [ ] **Step 3: Rewrite oembed.ts**

```ts
// apps/api/src/share/oembed.ts
import * as v from "valibot";

import { safeFetch } from "./safe-fetch.js";

export const OEMBED_MAX_BYTES = 65_536;

/** The video or page is private, removed, or never existed. A 404 for the caller. */
export class SourceGone extends Error {
  override readonly name = "SourceGone";
}

/** This rung failed and a later one may succeed. */
export class SourceUnavailable extends Error {
  override readonly name = "SourceUnavailable";
}

export interface SourceMeta {
  title: string;
  author: string | null;
  provider: string;
  pageUrl: string;
  shareId: string;
  thumbnailUrl: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
}

/**
 * `minLength(1)` after `trim`: TikTok answers 200 with a blank title for a
 * removed video, and without this the pipeline pays a model to read whitespace.
 */
const oembedSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1)),
  author_name: v.nullish(v.pipe(v.string(), v.trim())),
  provider_name: v.nullish(v.pipe(v.string(), v.trim())),
  thumbnail_url: v.optional(v.unknown()),
  thumbnail_width: v.optional(v.unknown()),
  thumbnail_height: v.optional(v.unknown()),
});

export function httpsUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function positiveIntOrNull(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.round(parsed);
}

export async function fetchOembed(
  endpoint: string,
  url: string,
  deadline: number,
  fetchImpl?: typeof fetch,
): Promise<Omit<SourceMeta, "shareId">> {
  const target = `${endpoint}${endpoint.includes("?") ? "&" : "?"}url=${encodeURIComponent(url)}&format=json`;

  let response;
  try {
    response = await safeFetch(target, {
      allow: ["application/json"],
      maxBytes: OEMBED_MAX_BYTES,
      deadline,
      fetchImpl,
    });
  } catch (cause) {
    throw new SourceUnavailable("oEmbed did not answer", { cause });
  }

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new SourceGone(`oEmbed answered ${response.status}`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SourceUnavailable(`oEmbed answered ${response.status}`);
  }

  let body: unknown;
  try {
    body = JSON.parse(response.body);
  } catch {
    throw new SourceUnavailable("oEmbed payload was not json");
  }

  const parsed = v.safeParse(oembedSchema, body);
  if (!parsed.success) throw new SourceUnavailable("oEmbed payload did not match the schema");

  const thumbnailUrl = httpsUrlOrNull(parsed.output.thumbnail_url);

  return {
    title: parsed.output.title,
    author: parsed.output.author_name || null,
    provider: parsed.output.provider_name || new URL(url).hostname,
    pageUrl: url,
    thumbnailUrl,
    thumbnailWidth: thumbnailUrl === null ? null : positiveIntOrNull(parsed.output.thumbnail_width),
    thumbnailHeight: thumbnailUrl === null ? null : positiveIntOrNull(parsed.output.thumbnail_height),
  };
}
```

- [ ] **Step 4: Run oEmbed tests, verify pass**

```bash
pnpm --filter api exec vitest run test/share-oembed.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing Open Graph test**

```ts
// apps/api/test/share-opengraph.test.ts
import { expect, test } from "vitest";

import { parseOpenGraph } from "../src/share/opengraph.js";

test("reads og:title, og:site_name and og:image with dimensions", () => {
  const html = `<html><head>
    <meta property="og:title" content="Hollow Knight: Silksong Review">
    <meta property="og:site_name" content="IGN">
    <meta property="og:image" content="https://assets.ign.com/a.jpg">
    <meta property="og:image:width" content="1280">
    <meta property="og:image:height" content="720">
  </head><body>ignored</body></html>`;

  expect(parseOpenGraph(html)).toEqual({
    title: "Hollow Knight: Silksong Review",
    siteName: "IGN",
    imageUrl: "https://assets.ign.com/a.jpg",
    imageWidth: 1280,
    imageHeight: 720,
  });
});

test("accepts name= as well as property=, which many sites emit", () => {
  const html = `<head><meta name="og:title" content="A Title"></head>`;
  expect(parseOpenGraph(html)?.title).toBe("A Title");
});

test("falls back to <title> when no og:title exists", () => {
  const html = `<html><head><title>  Plain Title  </title></head></html>`;

  expect(parseOpenGraph(html)).toEqual({
    title: "Plain Title",
    siteName: null,
    imageUrl: null,
    imageWidth: null,
    imageHeight: null,
  });
});

test("prefers og:title over <title>", () => {
  const html = `<head><title>Site name - Page</title><meta property="og:title" content="Page"></head>`;
  expect(parseOpenGraph(html)?.title).toBe("Page");
});

test("returns null when the page carries no title at all", () => {
  expect(parseOpenGraph("<html><head></head><body>hi</body></html>")).toBeNull();
  expect(parseOpenGraph("")).toBeNull();
});

test("ignores a title that is only whitespace", () => {
  expect(parseOpenGraph("<head><title>   </title></head>")).toBeNull();
});

test("drops a non-https og:image", () => {
  const html = `<head><meta property="og:title" content="A"><meta property="og:image" content="http://x.test/a.jpg"></head>`;

  expect(parseOpenGraph(html)?.imageUrl).toBeNull();
});

test("stops at </head> so body content cannot supply a title", () => {
  const html = `<head></head><body><title>From The Body</title></body>`;
  expect(parseOpenGraph(html)).toBeNull();
});
```

- [ ] **Step 6: Implement opengraph.ts**

```ts
// apps/api/src/share/opengraph.ts
import { Parser } from "htmlparser2";

import { httpsUrlOrNull } from "./oembed.js";
import { safeFetch } from "./safe-fetch.js";

export const HTML_MAX_BYTES = 524_288;

export interface PageMeta {
  title: string;
  siteName: string | null;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

function toPositiveInt(value: string | undefined): number | null {
  if (value === undefined) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function parseOpenGraph(html: string): PageMeta | null {
  const tags = new Map<string, string>();
  let documentTitle = "";
  let inTitle = false;

  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === "title") {
        inTitle = true;
        return;
      }

      if (name !== "meta") return;

      const key = (attributes["property"] ?? attributes["name"] ?? "").toLowerCase();
      const content = attributes["content"];
      if (key.startsWith("og:") && content !== undefined && !tags.has(key)) tags.set(key, content);
    },
    ontext(text) {
      if (inTitle) documentTitle += text;
    },
    onclosetag(name) {
      if (name === "title") inTitle = false;
      // Everything worth reading lives in the head; stopping here bounds the work.
      if (name === "head") parser.reset();
    },
  });

  parser.write(html);
  parser.end();

  const title = (tags.get("og:title") ?? documentTitle).trim();
  if (title === "") return null;

  const imageUrl = httpsUrlOrNull(tags.get("og:image"));

  return {
    title,
    siteName: tags.get("og:site_name")?.trim() || null,
    imageUrl,
    imageWidth: imageUrl === null ? null : toPositiveInt(tags.get("og:image:width")),
    imageHeight: imageUrl === null ? null : toPositiveInt(tags.get("og:image:height")),
  };
}

export async function fetchPage(
  url: string,
  deadline: number,
  fetchImpl?: typeof fetch,
): Promise<{ html: string; finalUrl: string }> {
  const response = await safeFetch(url, {
    allow: ["text/html", "application/xhtml+xml"],
    maxBytes: HTML_MAX_BYTES,
    deadline,
    fetchImpl,
  });

  return { html: response.body, finalUrl: response.finalUrl };
}
```

- [ ] **Step 7: Run Open Graph tests, verify pass**

```bash
pnpm --filter api exec vitest run test/share-opengraph.test.ts
```

Expected: PASS. If `parser.reset()` inside `onclosetag` throws, replace it with a boolean guard that ignores further callbacks after `head` closes.

- [ ] **Step 8: Write the failing ladder test**

```ts
// apps/api/test/share-meta.test.ts
import { expect, test, vi } from "vitest";

import { normaliseShare } from "../src/share/normalise.js";
import { fetchSourceMeta, SourceUnreadable } from "../src/share/meta.js";
import { SourceGone, SourceUnavailable } from "../src/share/oembed.js";

function json(payload: unknown, status = 200) {
  return new Response(status === 200 ? JSON.stringify(payload) : null, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

const YT = normaliseShare("https://www.youtube.com/watch?v=1vs0lLIRt7w")!;
const IGN = normaliseShare("https://www.ign.com/articles/a-review")!;
const SHORT = normaliseShare("https://vm.tiktok.com/ZMabcdef/")!;

test("takes the oEmbed rung when a scheme matches", async () => {
  const fetchImpl = vi.fn(async () => json({ title: "A Video", provider_name: "YouTube" }));

  const meta = await fetchSourceMeta(YT, fetchImpl as unknown as typeof fetch);

  expect(meta.title).toBe("A Video");
  expect(meta.provider).toBe("YouTube");
  expect(meta.shareId).toBe(YT.shareId);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("an oEmbed 404 is terminal and never scrapes the error page", async () => {
  const fetchImpl = vi.fn(async () => json(null, 404));

  await expect(fetchSourceMeta(YT, fetchImpl as unknown as typeof fetch)).rejects.toThrow(SourceGone);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("an oEmbed 500 falls through to the page", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(json(null, 500))
    .mockResolvedValueOnce(html('<head><meta property="og:title" content="Fallback"></head>'));

  const meta = await fetchSourceMeta(YT, fetchImpl as unknown as typeof fetch);

  expect(meta.title).toBe("Fallback");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("reads og:title for a page no provider claims", async () => {
  const fetchImpl = vi.fn(async () =>
    html(
      '<head><meta property="og:title" content="Silksong Review"><meta property="og:site_name" content="IGN"></head>',
    ),
  );

  const meta = await fetchSourceMeta(IGN, fetchImpl as unknown as typeof fetch);

  expect(meta.title).toBe("Silksong Review");
  expect(meta.author).toBe("IGN");
  expect(meta.provider).toBe("www.ign.com");
});

test("a short link resolves, re-matches, and lands back on oEmbed", async () => {
  const canonical = "https://www.tiktok.com/@creator/video/7123456789012345678";

  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    )
    .mockResolvedValueOnce(json({ title: "A Clip", provider_name: "TikTok" }));

  // The page fetch reports the canonical url as its finalUrl.
  const withFinalUrl = vi.fn(async (input: string) => {
    if (input.includes("vm.tiktok.com")) {
      return Response.redirect(canonical, 302);
    }
    return fetchImpl(input);
  });

  const meta = await fetchSourceMeta(SHORT, withFinalUrl as unknown as typeof fetch);

  expect(meta.provider).toBe("TikTok");
  expect(meta.pageUrl).toBe(canonical);
  // The extraction cache keys on this, so it must be the resolved id.
  expect(meta.shareId).toBe(normaliseShare(canonical)!.shareId);
});

test("a page with no title at all is unreadable and terminal", async () => {
  const fetchImpl = vi.fn(async () => html("<html><head></head><body>nothing</body></html>"));

  await expect(fetchSourceMeta(IGN, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
    SourceUnreadable,
  );
});

test("a page that cannot be read at all stays retriable", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new Error("socket hang up");
  });

  await expect(fetchSourceMeta(IGN, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
    SourceUnavailable,
  );
});
```

- [ ] **Step 9: Implement meta.ts**

```ts
// apps/api/src/share/meta.ts
import { fetchPage, parseOpenGraph } from "./opengraph.js";
import { normaliseShare, type NormalisedShare } from "./normalise.js";
import { fetchOembed, SourceGone, SourceUnavailable, type SourceMeta } from "./oembed.js";
import { matchProvider } from "./provider-match.js";
import { LADDER_BUDGET_MS } from "./safe-fetch.js";

/** We read the page and it had no title. Terminal: retrying will not help. */
export class SourceUnreadable extends Error {
  override readonly name = "SourceUnreadable";
}

export async function fetchSourceMeta(
  share: NormalisedShare,
  fetchImpl?: typeof fetch,
): Promise<SourceMeta> {
  const deadline = Date.now() + LADDER_BUDGET_MS;

  const direct = matchProvider(share.url);
  if (direct !== null) {
    try {
      return { ...(await fetchOembed(direct.endpoint, share.url, deadline, fetchImpl)), shareId: share.shareId };
    } catch (error) {
      // A gone source is terminal; anything else drops to the page below.
      if (error instanceof SourceGone) throw error;
    }
  }

  let page: { html: string; finalUrl: string };
  try {
    page = await fetchPage(share.url, deadline, fetchImpl);
  } catch (cause) {
    throw new SourceUnavailable("the page could not be read", { cause });
  }

  const resolved = normaliseShare(page.finalUrl) ?? share;

  // Only worth a second oEmbed attempt when the redirect actually moved us.
  if (resolved.url !== share.url) {
    const afterRedirect = matchProvider(resolved.url);
    if (afterRedirect !== null) {
      try {
        return {
          ...(await fetchOembed(afterRedirect.endpoint, resolved.url, deadline, fetchImpl)),
          shareId: resolved.shareId,
        };
      } catch (error) {
        if (error instanceof SourceGone) throw error;
      }
    }
  }

  const parsed = parseOpenGraph(page.html);
  if (parsed === null) throw new SourceUnreadable("the page carried no title");

  return {
    title: parsed.title,
    author: parsed.siteName,
    provider: new URL(resolved.url).hostname,
    pageUrl: resolved.url,
    shareId: resolved.shareId,
    thumbnailUrl: parsed.imageUrl,
    thumbnailWidth: parsed.imageWidth,
    thumbnailHeight: parsed.imageHeight,
  };
}
```

- [ ] **Step 10: Run ladder tests, verify pass**

```bash
pnpm --filter api exec vitest run test/share-meta.test.ts
```

Expected: PASS. The short-link test drives `safeFetch`'s real redirect handling through a stubbed `fetch`; if `Response.redirect` is awkward in the runner, build the redirect by hand with `new Response(null, { status: 302, headers: { location: canonical } })`.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/share/oembed.ts apps/api/src/share/opengraph.ts apps/api/src/share/meta.ts \
        apps/api/test/share-oembed.test.ts apps/api/test/share-opengraph.test.ts \
        apps/api/test/share-meta.test.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(share): add oembed, open graph and the metadata ladder"
```

---

## Task 7: Contracts and cache keys

Mechanical sweep. Goes red, then green. The compiler enumerates the call sites.

**Files:**
- Modify: `packages/contracts/src/share.ts`
- Modify: `packages/contracts/test/share.test.ts`
- Modify: `apps/api/src/cache-keys.ts`

**Interfaces:**
- Produces: `EXTRACTED_BASES`, `ShareSourceWire`, `shareIdentifySchema`, `sourceKey`, `extractKey`, `SOURCE_TTL_SECONDS`

- [ ] **Step 1: Rewrite the contracts test**

```ts
// packages/contracts/test/share.test.ts
import { describe, expect, test } from "vitest";
import * as v from "valibot";

import { EXTRACTED_BASES, shareIdentifySchema } from "../src/share.js";

describe("shareIdentifySchema", () => {
  const parse = (url: string) => v.safeParse(shareIdentifySchema, { url });

  test("accepts any https link", () => {
    expect(parse("https://www.youtube.com/watch?v=1vs0lLIRt7w").success).toBe(true);
    expect(parse("https://www.ign.com/articles/a-review").success).toBe(true);
    expect(parse("https://vimeo.com/123456789").success).toBe(true);
  });

  test("refuses http, userinfo, odd ports and junk", () => {
    expect(parse("http://www.youtube.com/watch?v=1vs0lLIRt7w").success).toBe(false);
    expect(parse("https://u:p@example.test/a").success).toBe(false);
    expect(parse("https://example.test:8443/a").success).toBe(false);
    expect(parse("not a url").success).toBe(false);
    expect(parse("").success).toBe(false);
  });
});

test("the basis tiers are title, author, web, none", () => {
  expect([...EXTRACTED_BASES]).toEqual(["title", "author", "web", "none"]);
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
pnpm --filter @repo/contracts exec vitest run
```

Expected: FAIL — `shareHostProvider` is still imported by the old test, and `EXTRACTED_BASES` still contains `channel`.

- [ ] **Step 3: Rewrite the share contract**

Replace the whole of `packages/contracts/src/share.ts` with:

```ts
import * as v from "valibot";

import { integerFrom } from "./coerce.js";
import type { GameSummaryWire } from "./wire.js";

export const SHARE_URL_MAX = 2048;
export const IDENTIFY_LIMIT_DEFAULT = 15;
export const IDENTIFY_LIMIT_MAX = 20;

// `isShareableUrl` was added in Task 3, Step 0. Keep it exactly as it is.

export const shareIdentifySchema = v.strictObject({
  url: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(SHARE_URL_MAX),
    v.check(isShareableUrl, "Only https links are supported"),
  ),
  limit: v.optional(integerFrom(1, IDENTIFY_LIMIT_MAX), IDENTIFY_LIMIT_DEFAULT),
});
export type ShareIdentifyBody = v.InferOutput<typeof shareIdentifySchema>;

export interface ShareSourceWire {
  /** oEmbed's provider_name where there is one, otherwise the hostname. */
  provider: string;
  shareId: string;
  title: string;
  author: string | null;
  pageUrl: string;
  /**
   * Some providers sign these and they can expire inside the cache TTL, so a
   * load failure on the client is ordinary rather than exceptional.
   */
  thumbnailUrl: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
}

/** The tiers the extraction chooses between. Drives both prompts and both schemas. */
export const EXTRACTED_BASES = ["title", "author", "web", "none"] as const;

/** `unavailable` is the route's own marker for an extraction that threw. */
export type ShareBasis = (typeof EXTRACTED_BASES)[number] | "unavailable";

export interface ShareIdentifyResponse {
  source: ShareSourceWire;
  basis: ShareBasis;
  /**
   * @deprecated Read `basis`. Kept so an older app build, which treats an
   * absent field as `false`, does not show the fallback notice on every result.
   */
  identified: boolean;
  guesses: string[];
  items: GameSummaryWire[];
}
```

- [ ] **Step 4: Run contracts tests, verify pass**

```bash
pnpm --filter @repo/contracts exec vitest run && pnpm --filter @repo/contracts build
```

Expected: PASS, then a clean build.

- [ ] **Step 5: Update cache keys**

In `apps/api/src/cache-keys.ts`, replace the `oembedKey` block and `extractKey`:

```ts
/** A published title effectively never changes, video or article. */
export const SOURCE_TTL_SECONDS = 604_800;

/**
 * Keyed on the requested url's id, not the post-redirect one: this is the only
 * id available before the fetch this cache exists to avoid.
 */
export function sourceKey(shareId: string): string {
  return `source:v3:${shareId}`;
}

export const EXTRACT_TTL_SECONDS = 2_592_000;

/**
 * Keyed on the post-redirect id, so a short link and a direct link to one page
 * share the expensive entry.
 */
export function extractKey(promptVersion: number, model: string, shareId: string): string {
  return `extract:v${promptVersion}:${model}:${shareId}`;
}
```

Delete the now-unused `ShareProviderName` import at `cache-keys.ts:3` (keep `GameFeed`).

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/share.ts packages/contracts/test/share.test.ts apps/api/src/cache-keys.ts
git commit -m "feat(contracts): open the share contract to any https link"
```

`pnpm check-types` is still red in `games.ts`, `types.ts`, `provider.ts`, and mobile. Tasks 8-11 close it.

---

## Task 8: Two-pass extraction

Pass 1 = today's call plus a `Site:` line. Pass 2 runs only on `none`.

**Files:**
- Modify: `apps/api/src/share/extract.ts` (rewrite)
- Test: rewrite `apps/api/test/share-extract.test.ts`

**Interfaces:**
- Consumes: `SourceMeta` (Task 6), `EXTRACTED_BASES` (Task 7)
- Produces:
  ```ts
  export const EXTRACT_PROMPT_VERSION = 3;
  export const MAX_GUESSES = 3;
  export const PASS_1_BASES = ["title", "author", "none"] as const;
  export const PASS_2_BASES = ["web", "none"] as const;
  export interface Extraction { titles: string[]; basis: (typeof EXTRACTED_BASES)[number] }
  export function parseExtraction(raw: string, allowed: readonly string[]): Extraction;
  export function createTitleExtractor(options: { apiKey: string; model: string; client?: OpenAI }):
    (meta: SourceMeta) => Promise<Extraction>;
  ```

Note: `extractTitles` takes `SourceMeta` alone. The URL it hands pass 2 is `meta.pageUrl`, so the route does not pass it separately.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/share-extract.test.ts
import { expect, test, vi } from "vitest";

import {
  createTitleExtractor,
  MAX_GUESSES,
  parseExtraction,
  PASS_1_BASES,
  PASS_2_BASES,
} from "../src/share/extract.js";
import type { SourceMeta } from "../src/share/oembed.js";

const META: SourceMeta = {
  title: "THIS CHANGES EVERYTHING",
  author: "Some Channel",
  provider: "YouTube",
  pageUrl: "https://www.youtube.com/watch?v=1vs0lLIRt7w",
  shareId: "abc123",
  thumbnailUrl: null,
  thumbnailWidth: null,
  thumbnailHeight: null,
};

test("parses a well-formed answer and trims the titles", () => {
  const raw = JSON.stringify({ titles: ["  Resident Evil 2 ", "Resident Evil 2 (1998)"], basis: "title" });

  expect(parseExtraction(raw, PASS_1_BASES)).toEqual({
    titles: ["Resident Evil 2", "Resident Evil 2 (1998)"],
    basis: "title",
  });
});

test("caps the list at MAX_GUESSES and drops empty strings", () => {
  const raw = JSON.stringify({ titles: ["A", "", "B", "C", "D"], basis: "author" });

  expect(parseExtraction(raw, PASS_1_BASES).titles).toEqual(["A", "B", "C"]);
  expect(MAX_GUESSES).toBe(3);
});

test("collapses to none when the two fields disagree", () => {
  expect(parseExtraction(JSON.stringify({ titles: ["A"], basis: "none" }), PASS_1_BASES)).toEqual({
    titles: [],
    basis: "none",
  });

  expect(parseExtraction(JSON.stringify({ titles: [], basis: "title" }), PASS_1_BASES)).toEqual({
    titles: [],
    basis: "none",
  });
});

test("refuses a basis the pass is not allowed to return", () => {
  expect(() => parseExtraction(JSON.stringify({ titles: ["A"], basis: "web" }), PASS_1_BASES)).toThrow();
  expect(() => parseExtraction(JSON.stringify({ titles: ["A"], basis: "title" }), PASS_2_BASES)).toThrow();
});

test("throws on anything unparseable so it stays out of the cache", () => {
  expect(() => parseExtraction("not json", PASS_1_BASES)).toThrow();
  expect(() => parseExtraction(JSON.stringify({ titles: "A", basis: "title" }), PASS_1_BASES)).toThrow();
});

function stubClient(...outputs: string[]) {
  const create = vi.fn();
  for (const output of outputs) create.mockResolvedValueOnce({ output_text: output, usage: {} });

  return { create, client: { responses: { create } } as never };
}

test("stops after pass 1 when it names a game", async () => {
  const { create, client } = stubClient(JSON.stringify({ titles: ["Elden Ring"], basis: "title" }));

  const extract = createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client });

  expect(await extract(META)).toEqual({ titles: ["Elden Ring"], basis: "title" });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0]![0].tools).toBeUndefined();
  expect(create.mock.calls[0]![0].reasoning).toEqual({ effort: "none" });
});

test("does not show pass 1 the url", async () => {
  const { create, client } = stubClient(JSON.stringify({ titles: ["Elden Ring"], basis: "title" }));

  await createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client })(META);

  expect(create.mock.calls[0]![0].input).not.toContain(META.pageUrl);
  expect(create.mock.calls[0]![0].input).toContain("Some Channel");
  expect(create.mock.calls[0]![0].input).toContain("YouTube");
});

test("escalates to a searching pass 2 when pass 1 gives up", async () => {
  const { create, client } = stubClient(
    JSON.stringify({ titles: [], basis: "none" }),
    JSON.stringify({ titles: ["Silksong"], basis: "web" }),
  );

  const extract = createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client });

  expect(await extract(META)).toEqual({ titles: ["Silksong"], basis: "web" });
  expect(create).toHaveBeenCalledTimes(2);

  const second = create.mock.calls[1]![0];
  expect(second.input).toContain(META.pageUrl);
  expect(second.reasoning).toEqual({ effort: "low" });
  expect(second.tools).toEqual([{ type: "web_search", search_context_size: "low" }]);
});

test("returns none when pass 2 also gives up", async () => {
  const { client } = stubClient(
    JSON.stringify({ titles: [], basis: "none" }),
    JSON.stringify({ titles: [], basis: "none" }),
  );

  expect(await createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client })(META)).toEqual({
    titles: [],
    basis: "none",
  });
});

test("propagates a pass 2 failure so nothing is cached", async () => {
  const create = vi
    .fn()
    .mockResolvedValueOnce({ output_text: JSON.stringify({ titles: [], basis: "none" }), usage: {} })
    .mockRejectedValueOnce(new Error("web search unavailable"));

  const client = { responses: { create } } as never;

  await expect(
    createTitleExtractor({ apiKey: "k", model: "gpt-5.4-mini", client })(META),
  ).rejects.toThrow("web search unavailable");
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
pnpm --filter api exec vitest run test/share-extract.test.ts
```

Expected: FAIL — `parseExtraction` takes one argument, `PASS_1_BASES` is undefined.

- [ ] **Step 3: Rewrite extract.ts**

```ts
// apps/api/src/share/extract.ts
import { getLogger } from "@logtape/logtape";
import { EXTRACTED_BASES } from "@repo/contracts";
import OpenAI from "openai";
import * as v from "valibot";

import type { SourceMeta } from "./oembed.js";

const log = getLogger(["api", "share"]);

/** Bump on any prompt edit: it is part of the cache key. */
export const EXTRACT_PROMPT_VERSION = 3;

/** Each guess costs one mirror search, so the fan-out is bounded here. */
export const MAX_GUESSES = 3;

export const PASS_1_BASES = ["title", "author", "none"] as const;
export const PASS_2_BASES = ["web", "none"] as const;

const PASS_1_MAX_TOKENS = 256;
/** 256 does not survive reasoning plus tool-call items in the output array. */
const PASS_2_MAX_TOKENS = 1024;

export interface Extraction {
  titles: string[];
  basis: (typeof EXTRACTED_BASES)[number];
}

const CANON = `Reply with the game's canonical English title as a games database would list it, not as the source spells it. Expand abbreviations and nicknames: "RE2" is "Resident Evil 2", "BOTW" is "The Legend of Zelda: Breath of the Wild", "GTA V" is "Grand Theft Auto V".

Give up to ${MAX_GUESSES} titles, most likely first. When a title could mean an original or its remake, list both, original first. Never pad the list to reach ${MAX_GUESSES}.`;

const PASS_1_SYSTEM = `You identify which video game a shared page or video is about, from its title, its author and the site it came from.

${CANON}

Work down these tiers, stop at the first that applies, and set \`basis\` to the tier you used:
- "title": the title names or clearly implies a game.
- "author": it does not, but you recognise the author or site — a channel, a creator, a publication — and it covers a game or a small set of games. Guess those.
- "none": neither. Return no titles.

Never invent an author or site you do not recognise.`;

const PASS_2_SYSTEM = `You identify which video game a shared page or video is about. The title and author were not enough, so search the web for the URL you are given and answer from what you find.

${CANON}

Set \`basis\` to "web" when the search told you which game it is, and "none" when it did not. Never report the page's own title as if it were a game, and return "none" rather than guess.`;

function schemaFor(bases: readonly string[]) {
  return {
    type: "json_schema" as const,
    name: "game_titles",
    strict: true,
    schema: {
      type: "object",
      properties: {
        // No `maxItems`: strict mode's support for it is unreliable.
        titles: { type: "array", items: { type: "string" } },
        basis: { type: "string", enum: [...bases] },
      },
      required: ["titles", "basis"],
      additionalProperties: false,
    },
  };
}

/**
 * Separated from the API call so the parsing rules test without a network or a
 * key. Throws on anything unexpected: a throw is what keeps a bad answer out of
 * the cache, and the route already fails soft around it.
 */
export function parseExtraction(raw: string, allowed: readonly string[]): Extraction {
  const schema = v.object({
    titles: v.array(v.pipe(v.string(), v.trim())),
    basis: v.picklist(allowed as unknown as [string, ...string[]]),
  });

  const parsed = v.parse(schema, JSON.parse(raw));
  const titles = parsed.titles.filter((title) => title !== "").slice(0, MAX_GUESSES);

  if (parsed.basis === "none" || titles.length === 0) return { titles: [], basis: "none" };

  return { titles, basis: parsed.basis as Extraction["basis"] };
}

function describe(meta: SourceMeta): string {
  const lines = [`Title: ${meta.title}`];
  if (meta.author !== null) lines.push(`Author: ${meta.author}`);
  lines.push(`Site: ${meta.provider}`);

  return lines.join("\n");
}

export function createTitleExtractor(options: {
  apiKey: string;
  model: string;
  client?: OpenAI;
}): (meta: SourceMeta) => Promise<Extraction> {
  const client = options.client ?? new OpenAI({ apiKey: options.apiKey });

  return async function extractTitles(meta: SourceMeta): Promise<Extraction> {
    const described = describe(meta);

    const first = await client.responses.create({
      model: options.model,
      instructions: PASS_1_SYSTEM,
      input: described,
      max_output_tokens: PASS_1_MAX_TOKENS,
      reasoning: { effort: "none" },
      text: { format: schemaFor(PASS_1_BASES) },
    });

    const pass1 = parseExtraction(first.output_text, PASS_1_BASES);
    if (pass1.basis !== "none") {
      log.debug("pass 1 extracted {count} title(s)", {
        count: pass1.titles.length,
        basis: pass1.basis,
        shareId: meta.shareId,
        inputTokens: first.usage?.input_tokens,
        outputTokens: first.usage?.output_tokens,
      });

      return pass1;
    }

    const second = await client.responses.create({
      model: options.model,
      instructions: PASS_2_SYSTEM,
      input: `${described}\nURL: ${meta.pageUrl}`,
      max_output_tokens: PASS_2_MAX_TOKENS,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search", search_context_size: "low" }],
      text: { format: schemaFor(PASS_2_BASES) },
    } as never);

    const pass2 = parseExtraction(second.output_text, PASS_2_BASES);

    log.debug("pass 2 extracted {count} title(s) after searching", {
      count: pass2.titles.length,
      basis: pass2.basis,
      shareId: meta.shareId,
      pageUrl: meta.pageUrl,
      inputTokens: second.usage?.input_tokens,
      outputTokens: second.usage?.output_tokens,
    });

    return pass2;
  };
}
```

If Task 1's probe said the combination does NOT work, change the pass-2 block to two calls: the first with `tools` and no `text.format`, the second reusing `schemaFor(PASS_2_BASES)` with `reasoning: { effort: "none" }` over `` `${described}\nSearch findings: ${searchText}` ``. Nothing else in this plan changes.

- [ ] **Step 4: Run tests, verify pass**

```bash
pnpm --filter api exec vitest run test/share-extract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/share/extract.ts apps/api/test/share-extract.test.ts
git commit -m "feat(share): escalate extraction to a web search on none"
```

---

## Task 9: Route rewiring

Closes the API side of the type errors.

**Files:**
- Modify: `apps/api/src/types.ts:41-53`
- Modify: `apps/api/src/share/provider.ts`
- Modify: `apps/api/src/routes/games.ts:145-245`
- Modify: `apps/api/test/helpers.ts:31`
- Test: rewrite `apps/api/test/identify-routes.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4-8
- Produces: `ShareProvider { model, fetchMeta(share), extractTitles(meta) }`

- [ ] **Step 1: Update the provider interface**

In `apps/api/src/types.ts`, replace the `ShareProvider` block and its imports:

```ts
import type { NormalisedShare } from "./share/normalise.js";
import type { Extraction } from "./share/extract.js";
import type { SourceMeta } from "./share/oembed.js";

/**
 * The impure edges of the identify pipeline, injected so the suite needs no
 * network. `normaliseShare` is deliberately absent: it is pure, so tests
 * exercise the real one.
 */
export interface ShareProvider {
  /** The model that produced a cached extraction — the route needs it for the key. */
  model: string;
  fetchMeta(share: NormalisedShare): Promise<SourceMeta>;
  extractTitles(meta: SourceMeta): Promise<Extraction>;
}
```

Delete the `Canonical`/`VideoRef`/`VideoMeta` imports at `types.ts:6-8`.

- [ ] **Step 2: Update the wiring**

Replace `apps/api/src/share/provider.ts` entirely:

```ts
import type { ShareProvider } from "../types.js";
import { createTitleExtractor } from "./extract.js";
import { fetchSourceMeta } from "./meta.js";

export function createShareProvider(env: {
  OPENAI_API_KEY: string;
  IDENTIFY_MODEL: string;
}): ShareProvider {
  return {
    model: env.IDENTIFY_MODEL,
    fetchMeta: (share) => fetchSourceMeta(share),
    extractTitles: createTitleExtractor({
      apiKey: env.OPENAI_API_KEY,
      model: env.IDENTIFY_MODEL,
    }),
  };
}
```

- [ ] **Step 3: Rewrite the route handler**

In `apps/api/src/routes/games.ts`, replace the whole `/identify` handler body (from `const { url, limit }` to the closing `return c.json(body);`) with:

```ts
      const { url, limit } = c.req.valid("json");

      const share = normaliseShare(url);
      if (share === null) {
        throw problems.create("UNPROCESSABLE_SHARE", {
          detail: "That link cannot be opened. Barklog needs an https web address.",
        });
      }

      let meta: SourceMeta;
      try {
        meta = await withCache(deps.cache, sourceKey(share.shareId), SOURCE_TTL_SECONDS, () =>
          deps.share.fetchMeta(share),
        );
      } catch (error) {
        if (error instanceof SourceGone) {
          throw problems.create("NOT_FOUND", {
            detail: "That page is unavailable — it may be private or removed.",
          });
        }
        if (error instanceof SourceUnreadable) {
          throw problems.create("UNPROCESSABLE_SHARE", {
            detail: "We opened that link but could not find a title on it.",
          });
        }
        // A fixed string: a 5xx must never carry the upstream message.
        throw problems.create("BAD_GATEWAY", {
          detail: "That link could not be read right now. Try again shortly.",
        });
      }

      let guesses: string[];
      let basis: ShareBasis;
      try {
        const extraction = await withCache(
          deps.cache,
          extractKey(EXTRACT_PROMPT_VERSION, deps.share.model, meta.shareId),
          EXTRACT_TTL_SECONDS,
          () => deps.share.extractTitles(meta),
        );
        guesses = extraction.titles;
        basis = extraction.basis;
      } catch (error) {
        log.warn("Extraction failed for {shareId}, falling back to the raw title: {message}", {
          shareId: meta.shareId,
          pageUrl: meta.pageUrl,
          message: error instanceof Error ? error.message : String(error),
        });
        guesses = [meta.title];
        basis = "unavailable";
      }

      const version = await searchVersion();
      const results = await Promise.all(
        guesses.map((guess) => cachedSearch(guess, PER_GUESS_LIMIT, 0, version)),
      );

      const body: ShareIdentifyResponse = {
        source: {
          provider: meta.provider,
          shareId: meta.shareId,
          title: meta.title,
          author: meta.author,
          pageUrl: meta.pageUrl,
          // `?? null`: `withCache` casts rather than validates, so an entry
          // written before these fields existed arrives without them.
          thumbnailUrl: meta.thumbnailUrl ?? null,
          thumbnailWidth: meta.thumbnailWidth ?? null,
          thumbnailHeight: meta.thumbnailHeight ?? null,
        },
        basis,
        identified: basis !== "unavailable",
        guesses,
        items: mergeCandidates(results, limit),
      };

      c.header("Cache-Control", "private, no-store");
      return c.json(body);
```

Fix the imports at the top of `games.ts`: drop `parseShareUrl`, `Canonical`, `VideoGone`, `VideoMeta`, `oembedKey`, `OEMBED_TTL_SECONDS`; add `normaliseShare`, `SourceGone`, `SourceUnreadable`, `SourceMeta`, `sourceKey`, `SOURCE_TTL_SECONDS`.

- [ ] **Step 4: Update the test stub**

In `apps/api/test/helpers.ts`, the share stub loses `resolveShortLink` and its `fetchMeta` now takes a `NormalisedShare`. Keep the throwing defaults:

```ts
  fetchMeta: () => {
    throw new Error("share.fetchMeta was not stubbed for this test");
  },
  extractTitles: () => {
    throw new Error("share.extractTitles was not stubbed for this test");
  },
```

- [ ] **Step 5: Update the route tests**

Rewrite `apps/api/test/identify-routes.test.ts` so its `META` is a `SourceMeta` and its stubs match the new interface. Keep every existing case and add these four:

```ts
test("refuses a link that is not https", async () => {
  const response = await harness.post("/games/identify", { url: "http://www.ign.com/a" });
  expect(response.status).toBe(422);
});

test("turns an unreadable page into a 422", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => {
        throw new SourceUnreadable("no title");
      },
    }),
  });

  const response = await app.post("/games/identify", { url: "https://www.ign.com/a" });
  expect(response.status).toBe(422);
});

test("reports a web basis when the extraction searched", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => META,
      extractTitles: async () => ({ titles: ["Silksong"], basis: "web" as const }),
    }),
  });

  const body = await (await app.post("/games/identify", { url: "https://www.ign.com/a" })).json();
  expect(body.basis).toBe("web");
});

test("carries the thumbnail dimensions through to the wire", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => ({ ...META, thumbnailWidth: 1280, thumbnailHeight: 720 }),
      extractTitles: async () => ({ titles: ["A"], basis: "title" as const }),
    }),
  });

  const body = await (await app.post("/games/identify", { url: "https://www.ign.com/a" })).json();
  expect(body.source.thumbnailWidth).toBe(1280);
  expect(body.source.thumbnailHeight).toBe(720);
});
```

- [ ] **Step 6: Run the whole API suite**

```bash
pnpm --filter api test && pnpm --filter api check-types && pnpm --filter api lint
```

Expected: all green. The API half is now complete.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "feat(api): identify any https link through the metadata ladder"
```

---

## Task 10: Mobile source preview and copy

**Files:**
- Modify: `apps/mobile/src/features/share/source-thumb.ts` (rewrite)
- Create: `apps/mobile/src/features/share/host.ts`
- Modify: `apps/mobile/src/features/share/share-header.tsx`
- Modify: `apps/mobile/src/features/share/sections.ts`
- Modify: `apps/mobile/src/features/share/empty-states.ts`
- Modify: `apps/mobile/src/features/share/share-screen.tsx:96-109`
- Test: rewrite `apps/mobile/test/source-thumb.test.ts`, create `apps/mobile/test/share-host.test.ts`, update `apps/mobile/test/share-sections.test.ts` and `apps/mobile/test/share-empty-states.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function sourceThumbSize(source: ShareSourceWire): { height: number; aspectRatio: number };
  export function displayHost(pageUrl: string): string;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/test/share-host.test.ts
import { expect, test } from "vitest";

import { displayHost } from "@/features/share/host";

test("strips a leading www", () => {
  expect(displayHost("https://www.ign.com/articles/a")).toBe("ign.com");
  expect(displayHost("https://www.youtube.com/watch?v=a")).toBe("youtube.com");
});

test("leaves other subdomains alone", () => {
  expect(displayHost("https://store.steampowered.com/app/1")).toBe("store.steampowered.com");
});

test("lowercases the host", () => {
  expect(displayHost("https://WWW.IGN.COM/a")).toBe("ign.com");
});

test("falls back to the raw string when it will not parse", () => {
  expect(displayHost("not a url")).toBe("not a url");
});
```

```ts
// apps/mobile/test/source-thumb.test.ts
import { expect, test } from "vitest";
import type { ShareSourceWire } from "@repo/contracts";

import { sourceThumbSize } from "@/features/share/source-thumb";

const SOURCE: ShareSourceWire = {
  provider: "YouTube",
  shareId: "abc",
  title: "A video",
  author: null,
  pageUrl: "https://www.youtube.com/watch?v=a",
  thumbnailUrl: "https://i.ytimg.com/vi/a/hqdefault.jpg",
  thumbnailWidth: null,
  thumbnailHeight: null,
};

test("defaults to 16:9 when no dimensions were reported", () => {
  expect(sourceThumbSize(SOURCE)).toEqual({ height: 56, aspectRatio: 16 / 9 });
});

test("uses the reported ratio when both dimensions are present", () => {
  expect(sourceThumbSize({ ...SOURCE, thumbnailWidth: 480, thumbnailHeight: 360 })).toEqual({
    height: 56,
    aspectRatio: 480 / 360,
  });
});

test("clamps a freak ratio so it cannot distort the row", () => {
  expect(
    sourceThumbSize({ ...SOURCE, thumbnailWidth: 4000, thumbnailHeight: 100 }).aspectRatio,
  ).toBe(1.8);

  expect(
    sourceThumbSize({ ...SOURCE, thumbnailWidth: 100, thumbnailHeight: 4000 }).aspectRatio,
  ).toBe(0.5);
});

test("ignores a partial or nonsensical pair", () => {
  expect(sourceThumbSize({ ...SOURCE, thumbnailWidth: 480 }).aspectRatio).toBe(16 / 9);
  expect(sourceThumbSize({ ...SOURCE, thumbnailWidth: 0, thumbnailHeight: 0 }).aspectRatio).toBe(16 / 9);
});
```

- [ ] **Step 2: Run them, verify they fail**

```bash
pnpm --filter mobile exec vitest run test/share-host.test.ts test/source-thumb.test.ts
```

Expected: FAIL — `displayHost` does not exist, `sourceThumbSize` takes a provider.

- [ ] **Step 3: Implement both**

```ts
// apps/mobile/src/features/share/host.ts

/** Derived from the url the tap opens, never from `provider`: that field is a
 * string supplied by the site we fetched, so any host can claim to be YouTube. */
export function displayHost(pageUrl: string): string {
  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return pageUrl;
  }
}
```

```ts
// apps/mobile/src/features/share/source-thumb.ts
import type { ShareSourceWire } from "@repo/contracts";

const THUMB_HEIGHT = 56;
const DEFAULT_RATIO = 16 / 9;
const MIN_RATIO = 0.5;
const MAX_RATIO = 1.8;

/**
 * Height fixed, width left to Yoga's `aspectRatio`. A bare height gives a
 * zero-width view: layout runs before the image decodes, and expo-image fills
 * the box it is given rather than reporting an intrinsic size.
 */
export function sourceThumbSize(source: ShareSourceWire): { height: number; aspectRatio: number } {
  const width = source.thumbnailWidth;
  const height = source.thumbnailHeight;

  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
    return { height: THUMB_HEIGHT, aspectRatio: DEFAULT_RATIO };
  }

  return {
    height: THUMB_HEIGHT,
    aspectRatio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height)),
  };
}
```

- [ ] **Step 4: Run them, verify they pass**

```bash
pnpm --filter mobile exec vitest run test/share-host.test.ts test/source-thumb.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update the copy modules**

In `apps/mobile/src/features/share/sections.ts`, replace the `title` computation:

```ts
  const title =
    basis === "title"
      ? "Matches for the title"
      : basis === "author"
        ? `Games ${author ?? "this source"} usually covers`
        : basis === "web"
          ? "Matches from a web search"
          : // `unavailable` has the rows a `title` basis would, but a header
            // would claim a match the server disclaimed.
            null;
```

In `apps/mobile/src/features/share/empty-states.ts`, replace three strings:

```ts
export const NO_LINK: EmptyStateContent = {
  title: "No link in that share",
  systemImage: "link",
  illustration: "share",
  description: "Barklog needs a web link. Share the page itself rather than a screenshot of it.",
};
```

```ts
export const UNAVAILABLE_NOTICE =
  "We couldn't tell which game this is, so these are matches for the title instead.";
```

```ts
      basis === "none"
        ? "We couldn't tell which game this is, even after searching the web. Open the original page to check."
        : basis === "unavailable" || guesses.length === 0
          ? "We couldn't tell which game this is about."
          : `We think this is about ${guesses.join(" or ")}, but it is not in the catalogue yet.`,
```

- [ ] **Step 6: Add the source link to the header**

In `apps/mobile/src/features/share/share-header.tsx`:

Add imports:
```tsx
import { openURL } from "expo-linking";

import { displayHost } from "@/features/share/host";
```

Add a third line inside the `sourceText` view, after the author block:
```tsx
          <Text
            style={styles.sourceLink}
            numberOfLines={1}
            accessibilityRole="link"
            onPress={() => void openURL(source.pageUrl)}
          >
            {displayHost(source.pageUrl)}
          </Text>
```

Add the style:
```tsx
  sourceLink: { ...Type.footnote, color: PlatformColor("link") },
```

Replace the two uses of `size` in `SourceCover`. The placeholder glyph becomes:
```tsx
          size={Math.min(size.height * size.aspectRatio, size.height) * 0.5}
```
and `sourceThumbSize` is now called as `sourceThumbSize(source)`.

- [ ] **Step 7: Retitle the escape hatch**

In `apps/mobile/src/features/share/share-screen.tsx`, replace the `secondaryAction` block:

```tsx
              secondaryAction={
                data.basis === "none"
                  ? {
                      label: `Open on ${displayHost(data.source.pageUrl)}`,
                      onPress: () => void openURL(data.source.pageUrl),
                    }
                  : undefined
              }
```

Add `import { displayHost } from "@/features/share/host";`.

- [ ] **Step 8: Update the copy tests and run the mobile suite**

Update the expected strings in `apps/mobile/test/share-sections.test.ts` and `apps/mobile/test/share-empty-states.test.ts` to match Step 5 exactly, and add a `web` basis case:

```ts
test("labels a web-searched result", () => {
  expect(toShareSections("web", [ITEM], null)[0]?.title).toBe("Matches from a web search");
});
```

```bash
pnpm --filter mobile test && pnpm --filter mobile check-types && pnpm --filter mobile lint
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src apps/mobile/test
git commit -m "feat(mobile): show the source host and size previews from oembed"
```

---

## Task 11: The searching state

Pass 2 adds seconds. A bare spinner is a poor thing to stare at.

**Files:**
- Create: `apps/mobile/src/features/share/searching-state.tsx`
- Modify: `apps/mobile/src/components/query-boundary.tsx`
- Modify: `apps/mobile/src/features/share/share-screen.tsx:82`

No unit test: both files import react-native, and the mobile runner is plain Node. Device case 1 in Task 12 covers it.

**Interfaces:**
- Consumes: `Mascot` (`@/components/mascot`), `ProgressView` (`@expo/ui/swift-ui`)
- Produces: `SearchingState`, and `QueryBoundary`'s optional `loading` prop

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/src/features/share/searching-state.tsx
import { Host, ProgressView } from "@expo/ui/swift-ui";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { Mascot } from "@/components/mascot";
import { Type } from "@/theme";

export function SearchingState() {
  return (
    <View style={styles.root}>
      <Mascot illustration="share" />
      <Text style={styles.label}>Working out which game this is</Text>
      <Host style={styles.spinner}>
        <ProgressView />
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  label: { ...Type.body, color: PlatformColor("secondaryLabel"), textAlign: "center" },
  /** `Host` has no intrinsic size; without one the spinner collapses. */
  spinner: { width: 32, height: 32 },
});
```

- [ ] **Step 2: Give QueryBoundary an optional loading node**

```tsx
export function QueryBoundary<T>({
  query,
  children,
  loading,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
}) {
  if (query.data !== undefined) return children(query.data);

  if (query.isPending) return loading ?? <LoadingState />;

  return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
}
```

Keep the existing comment above the `query.data` check — it records why the ordering matters.

- [ ] **Step 3: Use it on the share screen**

In `share-screen.tsx`, add `import { SearchingState } from "@/features/share/searching-state";`, then pass it:

```tsx
    <QueryBoundary query={identify} loading={<SearchingState />}>
```

Also swap the payload-resolution branch at line 70 so both waits look the same:

```tsx
  if (isPending) return <SearchingState />;
```

- [ ] **Step 4: Verify types and lint**

```bash
pnpm --filter mobile check-types && pnpm --filter mobile lint && pnpm --filter mobile test
```

Expected: green.

- [ ] **Step 5: Full sweep**

```bash
pnpm lint && pnpm check-types && pnpm test
```

Expected: green across every package.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src
git commit -m "feat(mobile): show the mascot while identifying a share"
```

---

## Task 12: Device verification

Everything above is green in CI and none of it proves the feature works. Run these on a real device with the API pointed at a real OpenAI key.

- [ ] **Step 1: Build and install**

```bash
pnpm --filter api dev            # terminal 1
pnpm --filter mobile ios:device        # terminal 2
```

Watch the API log in terminal 1 throughout. The `pass 1`/`pass 2` debug lines are how you tell which path a case actually took.

- [ ] **Step 2: Work the cases**

For each: share the link from Safari or the source app into Barklog, then check the expected column. "Ladder" names the rung that should produce the metadata; "pass" names how many model calls the log should show.

| # | Share this | Ladder | Pass | Expect on screen |
|---|---|---|---|---|
| 1 | A YouTube video whose title names a game outright, e.g. a "Silksong review" upload | oEmbed | 1 | Mascot + "Working out which game this is" while it loads. Then header shows the video title, the channel, and `youtube.com` as a tappable link. Section header "Matches for the title". 16:9 thumbnail. |
| 2 | A YouTube video with a vague title on a channel that only covers one game, e.g. a large Destiny or Warframe channel | oEmbed | 1 | Section header reads "Games <channel> usually covers". This is the `author` tier — if it says "Matches for the title" the model used tier 1, which is fine but pick a vaguer title to actually exercise tier 2. |
| 3 | A TikTok **short** link (`vm.tiktok.com/…`), copied from TikTok's own share sheet | HTML → re-match → oEmbed | 1 | Works at all. Header shows the TikTok creator and `tiktok.com`. Log shows two outbound fetches then one model call. This is the short-link loop. |
| 4 | An IGN review article | og:title | 1 | Header title is the article headline, author is "IGN", link reads `ign.com`. Thumbnail is the article's `og:image` at its own ratio, not 16:9. |
| 5 | A Reddit post from r/gaming or similar | oEmbed (new provider) | 1 or 2 | Identified at all — this provider was a hard 422 before. Log should show provider "Reddit". Reddit's schemes are `https://www.reddit.com/r/*/comments/*/*`, so use a full permalink, not a `redd.it` short link. |
| 6 | A Steam store page for a game | og:title | 1 | Header shows the store page title; `store.steampowered.com` in full, since only `www.` is stripped. Steam is not an oEmbed provider, so this genuinely exercises the Open Graph rung. |
| 6b | A Twitch clip | og:title | 1 or 2 | Twitch is **not** in `providers.json` — verified 2026-09-08. It falls to the Open Graph rung, and the log must show no oEmbed attempt. If it 422s, Twitch is serving a JS-rendered title and that is a known limitation, not a bug. |
| 7 | A YouTube video with a cryptic title on a channel nobody has heard of, where the game is only identifiable from the page itself | oEmbed | **2** | The important one. Log must show a pass 2 line with `pageUrl`. Section header "Matches from a web search". Expect this to take noticeably longer — that is what Task 11 exists for. |
| 8 | Any page clearly not about a game, e.g. a weather report | og:title | 2 | Empty state: "We couldn't tell which game this is, even after searching the web." Secondary button reads "Open on <host>" and opens the page. |
| 9 | A private or deleted YouTube video | oEmbed 404 | 0 | Error state, not a crash and not a scraped "Video unavailable" title. |
| 10 | A direct link to a PDF or an image file | refused | 0 | A clean error, no hang. The content-type check should refuse it before anything is parsed. |

- [ ] **Step 3: Check the two things easy to miss**

- Share the **same** link twice. The second run should be near-instant and show no new model call in the log — both caches hit.
- Share case 3's short link, then the same video's full URL. The log should show one model call in total across both, because the extraction cache keys on the resolved id.

- [ ] **Step 4: Record the results**

Append a short table to the spec under a new `## 18. Device verification` heading: case number, pass or fail, and the observed basis. Anything failing gets an issue rather than a silent fix.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-08-share-any-link-design.md
git commit -m "docs: record device verification results"
```
