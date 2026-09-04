import { afterAll, beforeEach, expect, test, vi } from "vitest";

import { problems } from "../src/problems.js";
import type { Canonical, VideoRef } from "../src/share/canonicalise.js";
import type { Extraction } from "../src/share/extract.js";
import type { VideoMeta } from "../src/share/oembed.js";
import { oembedKey } from "../src/cache-keys.js";
import { VideoGone, VideoMetaUnavailable } from "../src/share/oembed.js";
import type { ShareProvider } from "../src/types.js";
import { callApi, createTestApp, seedGame, type TestHarness } from "./helpers.js";

const RE2_URL = "https://www.youtube.com/watch?v=1vs0lLIRt7w";

const META: VideoMeta = {
  title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
  author: "Snamwiches",
  thumbnailUrl: "https://i.ytimg.com/vi/1vs0lLIRt7w/hqdefault.jpg",
};

function shareStub(overrides: Partial<ShareProvider> = {}): ShareProvider {
  return {
    model: "gpt-5.4-mini",
    resolveShortLink: async (): Promise<Canonical> => ({ kind: "unsupported" }),
    fetchMeta: async (_ref: VideoRef) => META,
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
  body: unknown = { url: RE2_URL },
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

test("identifies the game, returning ranked candidates and the video it came from", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });
  await seedGame(harness.db, { id: 2, name: "Resident Evil 2 Remake Mod", count: 4 });
  await seedGame(harness.db, { id: 3, name: "Hades", count: 900 });

  const response = await identify({ url: RE2_URL });
  const body = (await response.json()) as {
    source: {
      provider: string;
      videoId: string;
      title: string;
      author: string | null;
      pageUrl: string;
      thumbnailUrl: string | null;
    };
    basis: string;
    identified: boolean;
    guesses: string[];
    items: { id: number }[];
  };

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(body.source).toEqual({
    provider: "youtube",
    videoId: "1vs0lLIRt7w",
    title: META.title,
    author: "Snamwiches",
    pageUrl: RE2_URL,
    thumbnailUrl: META.thumbnailUrl,
  });
  expect(body.basis).toBe("title");
  expect(body.identified).toBe(true);
  expect(body.guesses).toEqual(["Resident Evil 2"]);
  expect(body.items.map((item) => item.id)).toEqual([1, 2]);
});

test("a video whose oEmbed carries no thumbnail still answers 200, with a null thumbnailUrl", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });

  const app = createTestApp({
    share: shareStub({ fetchMeta: async () => ({ ...META, thumbnailUrl: null }) }),
  });

  const response = await identifyOn(app.app);
  const body = (await response.json()) as { source: { thumbnailUrl: string | null } };

  expect(response.status).toBe(200);
  expect(body.source.thumbnailUrl).toBeNull();
  await app.close();
});

test("the response always carries thumbnailUrl, even for a cached VideoMeta without it", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });

  // A shape `withCache` would hand back unvalidated, since it casts.
  await harness.cache.set(
    oembedKey("youtube", "1vs0lLIRt7w"),
    { title: META.title, author: META.author },
    60,
  );

  const response = await identify({ url: RE2_URL });
  const body = (await response.json()) as { source: Record<string, unknown> };

  expect(response.status).toBe(200);
  expect(body.source).toHaveProperty("thumbnailUrl", null);
});

test("an unsupported host is 422, naming the url field", async () => {
  const response = await identify({ url: "https://vimeo.com/12345" });
  const body = (await response.json()) as { errors: { field: string }[]; type: string };

  expect(response.status).toBe(422);
  expect(body.errors[0]?.field).toBe("url");
  // The schema hook's shape, not the registry's — pins that this reaches
  // valibot's rejection and not `UNPROCESSABLE_SHARE`.
  expect(body.type).toBe("about:blank");
});

test("a supported host that is not a video page is 422", async () => {
  const response = await identify({ url: "https://www.youtube.com/feed/subscriptions" });
  const body = (await response.json()) as { type: string };

  expect(response.status).toBe(422);
  // The registry's shape, not the schema hook's — pins that a recognised host
  // with a non-video path reaches `UNPROCESSABLE_SHARE`, not schema validation.
  expect(body.type).toBe(problems.get("UNPROCESSABLE_SHARE").type);
});

test("a resolved short link identifies the video it points to", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });

  const app = createTestApp({
    share: shareStub({
      resolveShortLink: async (): Promise<Canonical> => ({
        kind: "video",
        ref: { provider: "youtube", videoId: "1vs0lLIRt7w", pageUrl: RE2_URL },
      }),
    }),
  });

  const response = await identifyOn(app.app, { url: "https://vm.tiktok.com/ZMabcdef1/" });
  const body = (await response.json()) as { source: { videoId: string } };

  expect(response.status).toBe(200);
  expect(body.source.videoId).toBe("1vs0lLIRt7w");
  await app.close();
});

test("a short link that resolves to nothing usable is 422", async () => {
  const app = createTestApp({
    share: shareStub({
      resolveShortLink: async (): Promise<Canonical> => ({ kind: "unsupported" }),
    }),
  });

  const response = await identifyOn(app.app, { url: "https://vm.tiktok.com/ZMabcdef1/" });

  expect(response.status).toBe(422);
  await app.close();
});

test("a short link the shortener failed to answer is 502, not a 422", async () => {
  const app = createTestApp({
    share: shareStub({
      resolveShortLink: async (): Promise<Canonical> => ({ kind: "unreachable" }),
    }),
  });

  const response = await identifyOn(app.app, { url: "https://vm.tiktok.com/ZMabcdef1/" });

  expect(response.status).toBe(502);
  await app.close();
});

test("a gone video is 404, not a 502", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => {
        throw new VideoGone("410");
      },
    }),
  });

  const response = await identifyOn(app.app);

  expect(response.status).toBe(404);
  await app.close();
});

test("an oEmbed outage is 502", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => {
        throw new VideoMetaUnavailable("500");
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

test("a failing extraction falls soft to the raw video title", async () => {
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

test("a channel-derived extraction reaches the client as such, so it can say what it is guessing from", async () => {
  await seedGame(harness.db, { id: 1, name: "Elden Ring", count: 5000 });

  const app = createTestApp({
    share: shareStub({
      extractTitles: async () => ({ titles: ["Elden Ring"], basis: "channel" }),
    }),
  });

  const response = await identifyOn(app.app);
  const body = (await response.json()) as { basis: string; identified: boolean };

  expect(body.basis).toBe("channel");
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
  expect(body.source.pageUrl).toBe(RE2_URL);
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

  await identify({ url: RE2_URL });
  await identify({ url: RE2_URL });

  expect(extractTitles).toHaveBeenCalledTimes(1);
});

test("a game with no match is 200 with an empty list and the guesses intact", async () => {
  const response = await identify({ url: RE2_URL });
  const body = (await response.json()) as { items: unknown[]; guesses: string[] };

  expect(response.status).toBe(200);
  expect(body.items).toEqual([]);
  expect(body.guesses).toEqual(["Resident Evil 2"]);
});

test("the route needs a session token", async () => {
  const response = await identify({ url: RE2_URL }, { user: null });

  expect(response.status).toBe(401);
});

test("a body without a JSON content type is 415", async () => {
  const response = await identifyOn(harness.app, { url: RE2_URL }, { headers: {} });

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
