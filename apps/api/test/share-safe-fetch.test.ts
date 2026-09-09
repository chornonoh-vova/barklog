import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { fetch as undiciFetch } from "undici";
import { describe, expect, test, vi } from "vitest";

import {
  BlockedAddress,
  FetchRefused,
  MAX_REDIRECTS,
  safeFetch,
  __internal,
} from "../src/share/safe-fetch.js";
import { PRIVATE_LOOKUP, PUBLIC_LOOKUP, testDeadline } from "./share-fixtures.js";

function jsonResponse(body: string, init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const opts = { allow: ["application/json"], maxBytes: 65_536, deadline: testDeadline() };

test("returns the body and the final url", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse('{"ok":true}'));

  const result = await safeFetch("https://example.test/a", {
    ...opts,
    lookup: PUBLIC_LOOKUP,
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
      lookup: PRIVATE_LOOKUP,
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
    lookup: PUBLIC_LOOKUP,
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
      lookup: PUBLIC_LOOKUP,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow(FetchRefused);
});

test("gives up after MAX_REDIRECTS redirects, one request past the cap", async () => {
  const fetchImpl = vi.fn(
    async () => new Response(null, { status: 302, headers: { location: "https://a.test/loop" } }),
  );

  await expect(
    safeFetch("https://a.test/loop", {
      ...opts,
      lookup: PUBLIC_LOOKUP,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow(FetchRefused);

  // The initial request plus MAX_REDIRECTS follow-up requests.
  expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
});

test("follows exactly MAX_REDIRECTS redirects before landing on content", async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://b.test/1" } }),
    )
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://b.test/2" } }),
    )
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://b.test/3" } }),
    )
    .mockResolvedValueOnce(jsonResponse('{"landed":true}'));

  const result = await safeFetch("https://a.test/start", {
    ...opts,
    lookup: PUBLIC_LOOKUP,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });

  expect(result.finalUrl).toBe("https://b.test/3");
  expect(result.body).toBe('{"landed":true}');
  expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
});

test("refuses a body past maxBytes", async () => {
  const fetchImpl = vi.fn(async () => jsonResponse("x".repeat(200)));

  await expect(
    safeFetch("https://a.test/big", {
      ...opts,
      maxBytes: 64,
      lookup: PUBLIC_LOOKUP,
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
      lookup: PUBLIC_LOOKUP,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  ).rejects.toThrow(FetchRefused);
});

test("refuses once the deadline has passed", async () => {
  await expect(
    safeFetch("https://a.test/a", {
      ...opts,
      deadline: Date.now() - 1,
      lookup: PUBLIC_LOOKUP,
      fetchImpl: (async () => jsonResponse("{}")) as unknown as typeof fetch,
    }),
  ).rejects.toThrow(FetchRefused);
});

test("refuses globalThis.fetch outright, since it cannot honor the pinned dispatcher", async () => {
  await expect(
    safeFetch("https://example.test/a", {
      ...opts,
      lookup: PUBLIC_LOOKUP,
      fetchImpl: globalThis.fetch,
    }),
  ).rejects.toThrow(FetchRefused);
});

// --- Defects found in the brief's reference implementation ---

describe("defect: IPv6 literal hosts", () => {
  test("checks a literal IPv6 host's own address, without calling lookup, and allows a public one", async () => {
    const lookup = vi.fn(PUBLIC_LOOKUP);
    const fetchImpl = vi.fn(async () => jsonResponse('{"ok":true}'));

    const result = await safeFetch("https://[2606:4700:4700::1111]/a", {
      ...opts,
      lookup,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.body).toBe('{"ok":true}');
    expect(lookup).not.toHaveBeenCalled();
  });

  test("checks a literal IPv6 loopback host and refuses it without ever fetching", async () => {
    const lookup = vi.fn(PUBLIC_LOOKUP);
    const fetchImpl = vi.fn(async () => jsonResponse("{}"));

    await expect(
      safeFetch("https://[::1]/a", {
        ...opts,
        lookup,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(BlockedAddress);

    expect(lookup).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("checks a literal IPv4-mapped IPv6 host and refuses the loopback it wraps", async () => {
    // ::ffff:127.0.0.1 as a URL host, brackets included, no DNS involved at all.
    const fetchImpl = vi.fn(async () => jsonResponse("{}"));

    await expect(
      safeFetch("https://[::ffff:127.0.0.1]/a", {
        ...opts,
        lookup: PUBLIC_LOOKUP,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(BlockedAddress);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("defect: unbounded DNS lookup", () => {
  test("refuses once the deadline passes while lookup is still pending", async () => {
    const slowLookup = () =>
      new Promise<{ address: string; family: 4 | 6 }[]>((resolve) => {
        setTimeout(() => resolve([{ address: "93.184.216.34", family: 4 }]), 300);
      });
    const fetchImpl = vi.fn(async () => jsonResponse("{}"));

    await expect(
      safeFetch("https://slow.test/a", {
        ...opts,
        deadline: Date.now() + 30,
        lookup: slowLookup,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(FetchRefused);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("defect: dispatcher lifetime and DNS pinning against a real socket", () => {
  test("pins the connection to the resolved address (bypassing real DNS) and reads a multi-chunk body in full before closing the dispatcher", async () => {
    const chunkA = "a".repeat(20_000);
    const chunkB = "b".repeat(20_000);

    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write(chunkA);
      setTimeout(() => {
        res.write(chunkB);
        res.end();
      }, 10);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const dispatcher = __internal.createPinnedDispatcher("127.0.0.1", 4);

      // A hostname that cannot resolve over real DNS. If the custom lookup
      // were not actually wired into the agent's connector, this fetch would
      // reject with an ENOTFOUND/getaddrinfo error instead of reaching the
      // local server. Uses undici's own `fetch`, matching what `safeFetch`
      // defaults to — Node's global `fetch` rejects an `Agent` built from the
      // npm `undici` package outright (see report: version mismatch).
      const response = await undiciFetch(`http://dns-pin-proof.invalid.test:${String(port)}/`, {
        dispatcher,
      });

      const body = await __internal.readCapped(response, 100_000);
      await dispatcher.close();

      expect(body).toBe(chunkA + chunkB);
    } finally {
      server.close();
    }
  });
});
