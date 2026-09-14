import type { LookupFn } from "../src/share/safe-fetch.js";

/**
 * Every module in the share ladder is tested through an injected `lookup` and
 * `fetchImpl`, so no test resolves DNS or opens a socket. These are the two
 * answers those tests need.
 */
export const PUBLIC_LOOKUP: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
export const PRIVATE_LOOKUP: LookupFn = async () => [{ address: "10.0.0.5", family: 4 }];

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(status === 200 ? JSON.stringify(payload) : null, {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

/** The ladder's own budget, far enough out that no test races it. */
export const testDeadline = (): number => Date.now() + 8_000;
