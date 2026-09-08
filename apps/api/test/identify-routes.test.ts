import { afterAll, beforeEach, expect, test, vi } from "vitest";

import { extractKey, sourceKey } from "../src/cache-keys.js";
import { problems } from "../src/problems.js";
import { EXTRACT_PROMPT_VERSION, type Extraction } from "../src/share/extract.js";
import { SourceUnreadable } from "../src/share/meta.js";
import { normaliseShare } from "../src/share/normalise.js";
import { SourceGone, SourceUnavailable, type SourceMeta } from "../src/share/oembed.js";
import { BlockedAddress } from "../src/share/safe-fetch.js";
import type { ShareProvider } from "../src/types.js";
import { callApi, createTestApp, logs, seedGame, type TestHarness } from "./helpers.js";

const SHARE_URL = "https://www.ign.com/articles/re2-review";
const SHARE_ID = normaliseShare(SHARE_URL)!.shareId;

const META: SourceMeta = {
  title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
  author: "Snamwiches",
  provider: "IGN",
  pageUrl: SHARE_URL,
  shareId: SHARE_ID,
  thumbnailUrl: "https://i.ytimg.com/vi/1vs0lLIRt7w/hqdefault.jpg",
  thumbnailWidth: null,
  thumbnailHeight: null,
};

function shareStub(overrides: Partial<ShareProvider> = {}): ShareProvider {
  return {
    model: "gpt-5.4-mini",
    fetchMeta: async () => META,
    extractTitles: async () => ({ titles: ["Resident Evil 2"], basis: "title" }),
    ...overrides,
  };
}

const extractTitles = vi.fn(async (): Promise<Extraction> => ({
  titles: ["Resident Evil 2"],
  basis: "title",
}));

const harness = createTestApp({ share: shareStub({ extractTitles }) });

beforeEach(async () => {
  await harness.reset();
  extractTitles.mockClear();
});

afterAll(async () => {
  await harness.close();
});

const identifyOn = (
  app: TestHarness["app"],
  body: unknown = { url: SHARE_URL },
  init: RequestInit & { user?: string | null } = {},
) =>
  callApi(app, "/api/games/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });

const identify = (body: unknown, init: RequestInit & { user?: string | null } = {}) =>
  identifyOn(harness.app, body, init);

test("identifies the game, returning ranked candidates and the source it came from", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });
  await seedGame(harness.db, { id: 2, name: "Resident Evil 2 Remake Mod", count: 4 });
  await seedGame(harness.db, { id: 3, name: "Hades", count: 900 });

  const response = await identify({ url: SHARE_URL });
  const body = (await response.json()) as {
    source: {
      provider: string;
      shareId: string;
      title: string;
      author: string | null;
      pageUrl: string;
      thumbnailUrl: string | null;
      thumbnailWidth: number | null;
      thumbnailHeight: number | null;
    };
    basis: string;
    identified: boolean;
    guesses: string[];
    items: { id: number }[];
  };

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(body.source).toEqual({
    provider: META.provider,
    shareId: META.shareId,
    title: META.title,
    author: META.author,
    pageUrl: META.pageUrl,
    thumbnailUrl: META.thumbnailUrl,
    thumbnailWidth: META.thumbnailWidth,
    thumbnailHeight: META.thumbnailHeight,
  });
  expect(body.basis).toBe("title");
  expect(body.identified).toBe(true);
  expect(body.guesses).toEqual(["Resident Evil 2"]);
  expect(body.items.map((item) => item.id)).toEqual([1, 2]);
});

test("a source whose metadata carries no thumbnail still answers 200, with a null thumbnailUrl", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });

  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => ({ ...META, thumbnailUrl: null, thumbnailWidth: null, thumbnailHeight: null }),
    }),
  });

  const response = await identifyOn(app.app);
  const body = (await response.json()) as { source: { thumbnailUrl: string | null } };

  expect(response.status).toBe(200);
  expect(body.source.thumbnailUrl).toBeNull();
  await app.close();
});

test("the response always carries the thumbnail fields, even for a cached SourceMeta without them", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });

  // A shape `withCache` would hand back unvalidated, since it casts.
  await harness.cache.set(
    sourceKey(SHARE_ID),
    { title: META.title, author: META.author, provider: META.provider, pageUrl: META.pageUrl, shareId: SHARE_ID },
    60,
  );

  const response = await identify({ url: SHARE_URL });
  const body = (await response.json()) as { source: Record<string, unknown> };

  expect(response.status).toBe(200);
  expect(body.source).toHaveProperty("thumbnailUrl", null);
  expect(body.source).toHaveProperty("thumbnailWidth", null);
  expect(body.source).toHaveProperty("thumbnailHeight", null);
});

test("refuses a link that is not https", async () => {
  const response = await identify({ url: "http://www.ign.com/a" });

  expect(response.status).toBe(422);
});

test("an unparseable url is 422, naming the url field via the schema, not the registry", async () => {
  const response = await identify({ url: "not a url" });
  const body = (await response.json()) as { errors: { field: string }[]; type: string };

  expect(response.status).toBe(422);
  expect(body.errors[0]?.field).toBe("url");
  // The schema hook's shape, not the registry's — pins that this reaches
  // valibot's rejection and not `UNPROCESSABLE_SHARE`.
  expect(body.type).toBe("about:blank");
});

test("turns an unreadable page into a 422", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => {
        throw new SourceUnreadable("no title");
      },
    }),
  });

  const response = await identifyOn(app.app);
  const body = (await response.json()) as { type: string };

  expect(response.status).toBe(422);
  // The registry's shape, not the schema hook's — pins that an unreadable
  // page reaches `UNPROCESSABLE_SHARE`, not schema validation.
  expect(body.type).toBe(problems.get("UNPROCESSABLE_SHARE").type);
  await app.close();
});

test("reports a web basis when the extraction searched", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => META,
      extractTitles: async () => ({ titles: ["Silksong"], basis: "web" as const }),
    }),
  });

  const body = (await identifyOn(app.app).then((response) => response.json())) as { basis: string };
  expect(body.basis).toBe("web");
  await app.close();
});

test("carries the thumbnail dimensions through to the wire", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => ({ ...META, thumbnailWidth: 1280, thumbnailHeight: 720 }),
      extractTitles: async () => ({ titles: ["A"], basis: "title" as const }),
    }),
  });

  const body = (await identifyOn(app.app).then((response) => response.json())) as {
    source: { thumbnailWidth: number | null; thumbnailHeight: number | null };
  };
  expect(body.source.thumbnailWidth).toBe(1280);
  expect(body.source.thumbnailHeight).toBe(720);
  await app.close();
});

test("a gone source is 404, not a 502", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => {
        throw new SourceGone("410");
      },
    }),
  });

  const response = await identifyOn(app.app);

  expect(response.status).toBe(404);
  await app.close();
});

test("a metadata outage is 502", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => {
        throw new SourceUnavailable("500");
      },
    }),
  });

  const response = await identifyOn(app.app);
  const body = (await response.json()) as { detail?: string };

  expect(response.status).toBe(502);
  // The 5xx must not leak the upstream exception message.
  expect(body.detail ?? "").not.toContain("500");
  await app.close();
});

test("a blocked address is logged at warn, since a 502 with no log line would hide an SSRF probe", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => {
        throw new BlockedAddress("10.0.0.5 is a blocked address");
      },
    }),
  });

  const response = await identifyOn(app.app);

  expect(response.status).toBe(502);

  const warnLine = logs.records.find(
    (record) => record.category.includes("identify") && record.level === "warning",
  );
  expect(warnLine?.properties).toMatchObject({ shareId: SHARE_ID, errorClass: "BlockedAddress" });
  await app.close();
});

test("a failed metadata fetch is not cached, so the next call retries it", async () => {
  let calls = 0;
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => {
        calls += 1;
        throw new SourceUnavailable("boom");
      },
    }),
  });

  await identifyOn(app.app);
  await identifyOn(app.app);

  expect(calls).toBe(2);
  await app.close();
});

test("a failing extraction falls soft to the raw title", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });

  const app = createTestApp({
    share: shareStub({
      extractTitles: async () => {
        throw new Error("openai is down");
      },
    }),
  });

  const response = await identifyOn(app.app);
  const body = (await response.json()) as {
    basis: string;
    identified: boolean;
    guesses: string[];
  };

  expect(response.status).toBe(200);
  // `unavailable`, not `none`: the model never answered, so its tiers say nothing.
  expect(body.basis).toBe("unavailable");
  expect(body.identified).toBe(false);
  expect(body.guesses).toEqual([META.title]);
  await app.close();
});

test("an author-derived extraction reaches the client as such, so it can say what it is guessing from", async () => {
  await seedGame(harness.db, { id: 1, name: "Elden Ring", count: 5000 });

  const app = createTestApp({
    share: shareStub({
      extractTitles: async () => ({ titles: ["Elden Ring"], basis: "author" }),
    }),
  });

  const response = await identifyOn(app.app);
  const body = (await response.json()) as { basis: string; identified: boolean };

  expect(body.basis).toBe("author");
  expect(body.identified).toBe(true);
  await app.close();
});

test("an extraction that identified nothing is `none`, with the page url left to fall back on", async () => {
  const app = createTestApp({
    share: shareStub({ extractTitles: async () => ({ titles: [], basis: "none" }) }),
  });

  const response = await identifyOn(app.app);
  const body = (await response.json()) as {
    basis: string;
    guesses: string[];
    items: unknown[];
    source: { pageUrl: string };
  };

  expect(body.basis).toBe("none");
  expect(body.guesses).toEqual([]);
  expect(body.items).toEqual([]);
  expect(body.source.pageUrl).toBe(SHARE_URL);
  await app.close();
});

test("a failed extraction is not cached, so the next call retries it", async () => {
  let calls = 0;
  const app = createTestApp({
    share: shareStub({
      extractTitles: async () => {
        calls += 1;
        throw new Error("openai is down");
      },
    }),
  });

  const send = () => identifyOn(app.app);

  await send();
  await send();

  expect(calls).toBe(2);
  await app.close();
});

test("a repeated identify reuses the cached extraction", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });

  await identify({ url: SHARE_URL });
  await identify({ url: SHARE_URL });

  expect(extractTitles).toHaveBeenCalledTimes(1);
});

test("collapses two different requested links onto one cached extraction when they resolve to the same source", async () => {
  const extraction = vi.fn(async (): Promise<Extraction> => ({ titles: ["Resident Evil 2"], basis: "title" }));

  // Both requests key the metadata cache differently (distinct requested
  // shareIds), but `fetchMeta` here reports the same resolved source both
  // times — as a redirect through a short link would — so the extraction
  // cache, keyed on `meta.shareId`, must collapse onto one entry.
  const app = createTestApp({
    share: shareStub({ fetchMeta: async () => META, extractTitles: extraction }),
  });

  await identifyOn(app.app, { url: "https://short.example/abc" });
  await identifyOn(app.app, { url: "https://short.example/xyz" });

  expect(extraction).toHaveBeenCalledTimes(1);
  await app.close();
});

test("the extraction cache key is built from the resolved shareId, not the requested one", () => {
  const requestedId = normaliseShare("https://short.example/abc")!.shareId;

  expect(extractKey(EXTRACT_PROMPT_VERSION, "gpt-5.4-mini", META.shareId)).not.toBe(
    extractKey(EXTRACT_PROMPT_VERSION, "gpt-5.4-mini", requestedId),
  );
});

test("a game with no match is 200 with an empty list and the guesses intact", async () => {
  const response = await identify({ url: SHARE_URL });
  const body = (await response.json()) as { items: unknown[]; guesses: string[] };

  expect(response.status).toBe(200);
  expect(body.items).toEqual([]);
  expect(body.guesses).toEqual(["Resident Evil 2"]);
});

test("the route needs a session token", async () => {
  const response = await identify({ url: SHARE_URL }, { user: null });

  expect(response.status).toBe(401);
});

test("a body without a JSON content type is 415", async () => {
  const response = await identifyOn(harness.app, { url: SHARE_URL }, { headers: {} });

  expect(response.status).toBe(415);
});

test("the identify scope is tighter than the overall one", async () => {
  const app = createTestApp({
    share: shareStub(),
    rateLimits: { identify: { limit: 2, windowSeconds: 60 } },
  });

  const send = () => identifyOn(app.app);

  expect((await send()).status).toBe(200);
  expect((await send()).status).toBe(200);

  const limited = await send();
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBeTruthy();
  await app.close();
});
