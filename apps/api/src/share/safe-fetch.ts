import { lookup as dnsLookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

import { isShareableUrl } from "@repo/contracts";
import { Agent, fetch as undiciFetch } from "undici";

import { isPublicUnicast } from "./ip-policy.js";

/** Redirects followed, not requests sent: the loop below also makes the initial request. */
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

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/**
 * `new URL(...).hostname` keeps the brackets on an IPv6 literal (`"[::1]"`),
 * which `dns.lookup` cannot resolve — it throws `ENOTFOUND`, which reads as a
 * network failure rather than the policy hit it actually is. A literal host
 * also has no business going through DNS at all: the address is already
 * known, so check it directly instead of routing it through `lookup`.
 */
function literalAddress(hostname: string): { address: string; family: 4 | 6 } | null {
  const bare = stripBrackets(hostname);
  if (isIPv4(bare)) return { address: bare, family: 4 };
  if (isIPv6(bare)) return { address: bare, family: 6 };
  return null;
}

function withDeadline<T>(promise: Promise<T>, deadline: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new FetchRefused(message)),
      Math.max(0, deadline - Date.now()),
    );
    timer.unref?.();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      },
    );
  });
}

async function resolveAndCheck(
  hostname: string,
  lookup: LookupFn,
  deadline: number,
): Promise<{ address: string; family: 4 | 6 }> {
  const literal = literalAddress(hostname);
  if (literal !== null) {
    if (!isPublicUnicast(literal.address, literal.family)) {
      throw new BlockedAddress(`${hostname} is a blocked address`);
    }
    return literal;
  }

  let entries: { address: string; family: 4 | 6 }[];
  try {
    // Bounded: an unresolving or stalling resolver must not be able to hold
    // the ladder open past its own budget.
    entries = await withDeadline(lookup(hostname), deadline, `lookup timed out for ${hostname}`);
  } catch (cause) {
    if (cause instanceof FetchRefused) throw cause;
    throw new FetchRefused(`could not resolve ${hostname}`, { cause });
  }

  if (entries.length === 0) throw new FetchRefused(`no addresses for ${hostname}`);

  // Every answer, not just the first: a resolver returning one public and
  // one private address must not be usable by picking the private one.
  for (const entry of entries) {
    if (!isPublicUnicast(entry.address, entry.family)) {
      throw new BlockedAddress(`${hostname} resolves to a blocked address`);
    }
  }

  return entries[0]!;
}

/**
 * The address is pinned into the agent's own connector, so the socket
 * connects to the address the check already saw. Checking an address and
 * then calling `fetch(hostname)` lets the connector re-resolve at connect
 * time, which is exactly the DNS-rebinding gap this whole module exists to close.
 */
function createPinnedDispatcher(address: string, family: 4 | 6): Agent {
  return new Agent({
    connect: {
      // Node's connector requests the `all` shape (an array of candidates)
      // when Happy Eyeballs is in play, and the scalar shape otherwise —
      // answering with the wrong shape surfaces as an unrelated-looking
      // "Invalid IP address: undefined" deep in `node:net`.
      lookup: (_hostname, lookupOptions, callback) => {
        if (lookupOptions.all === true) {
          callback(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
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

/**
 * Both branches end by closing `dispatcher` themselves, once they are truly
 * done with the response body — not before. Closing an agent while its body
 * is still being streamed is a truncation risk, so the closing call lives
 * next to the code that finishes reading (or explicitly drops) that body,
 * rather than in a `finally` around the `fetch` call that returned it.
 */
async function drainAndClose(response: Response, dispatcher: Agent): Promise<void> {
  try {
    await response.body?.cancel().catch(() => {});
  } finally {
    await dispatcher.close().catch(() => {});
  }
}

async function readCappedAndClose(
  response: Response,
  maxBytes: number,
  dispatcher: Agent,
): Promise<string> {
  try {
    return await readCapped(response, maxBytes);
  } finally {
    await dispatcher.close().catch(() => {});
  }
}

export async function safeFetch(
  url: string,
  options: {
    /** Acceptable content-type prefixes. Sent joined as the `Accept` header. */
    allow: readonly string[];
    maxBytes: number;
    deadline: number;
    lookup?: LookupFn;
    /**
     * Leave unset outside tests. Whatever is passed here MUST forward the
     * `dispatcher` init option through to an actual connection — that is the
     * only thing that makes the address check upstream binding rather than
     * advisory. Node's own global `fetch` does not qualify (see the check
     * below); a hand-rolled mock that ignores its `init` argument does not
     * either, silently, and no mocked test can catch that because a mock
     * ignoring an argument it doesn't care about is exactly what a mock is.
     */
    fetchImpl?: typeof fetch;
  },
): Promise<SafeResponse> {
  const lookup = options.lookup ?? defaultLookup;

  // Node's own global `fetch` is backed by a different, internally bundled
  // build of undici than this package's `Agent`. Handing it an `Agent` from
  // the npm package throws (`invalid onRequestStart method`) — a version
  // mismatch between the two, not a bug in the dispatcher wiring. Defaulting
  // to undici's own `fetch` keeps the pair from the same build. Checked
  // explicitly, and rejected up front with a message that says why, because
  // otherwise the failure surfaces as a cryptic error from deep inside
  // undici the first time someone "simplifies" this back to global fetch.
  if (options.fetchImpl === globalThis.fetch) {
    throw new FetchRefused(
      "safeFetch cannot use the global fetch: it does not honor the pinned dispatcher, " +
        "which silently defeats the DNS-rebinding guard. Omit fetchImpl to use undici's own fetch.",
    );
  }
  const fetchImpl = options.fetchImpl ?? (undiciFetch as unknown as typeof fetch);

  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (Date.now() >= options.deadline) throw new FetchRefused("ladder budget exhausted");
    if (!isShareableUrl(current)) throw new FetchRefused(`refused url: ${current}`);

    const { address, family } = await resolveAndCheck(
      new URL(current).hostname,
      lookup,
      options.deadline,
    );
    const dispatcher = createPinnedDispatcher(address, family);

    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: options.allow.join(", ") },
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(HOP_TIMEOUT_MS, options.deadline - Date.now())),
        ),
        // undici accepts `dispatcher`; the DOM lib fetch types do not.
        dispatcher,
      } as RequestInit & { dispatcher: Agent });
    } catch (cause) {
      await dispatcher.close().catch(() => {});
      throw new FetchRefused(`request failed for ${current}`, { cause });
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await drainAndClose(response, dispatcher);

      if (location === null) throw new FetchRefused("redirect without a location");

      try {
        current = new URL(location, current).toString();
      } catch {
        throw new FetchRefused("redirect location is not a url");
      }

      continue;
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!response.ok) {
      await drainAndClose(response, dispatcher);
      return { status: response.status, headers: response.headers, body: "", finalUrl: current };
    }
    if (!options.allow.some((type) => contentType.includes(type))) {
      await drainAndClose(response, dispatcher);
      throw new FetchRefused(`unexpected content-type: ${contentType}`);
    }

    return {
      status: response.status,
      headers: response.headers,
      body: await readCappedAndClose(response, options.maxBytes, dispatcher),
      finalUrl: current,
    };
  }

  throw new FetchRefused(`more than ${MAX_REDIRECTS} redirects`);
}

/** Exported only so tests can exercise the real dispatcher wiring end-to-end. */
export const __internal = { createPinnedDispatcher, readCapped };
