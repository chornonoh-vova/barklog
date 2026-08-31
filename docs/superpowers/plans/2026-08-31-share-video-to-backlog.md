# Share a Video, Fetch the Game — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user share a YouTube or TikTok video into Barklog and pick the game it is about from a bottom sheet, landing on the normal game detail screen.

**Architecture:** A new `POST /api/games/identify` canonicalises the shared URL, reads keyless oEmbed metadata, extracts candidate game titles with Claude Haiku 4.5, and ranks those guesses through the existing `pg_trgm` search over the games mirror. On the phone, `expo-sharing`'s config plugin generates an iOS Share Extension; `+native-intent.ts` routes the incoming payload to a `/shared` modal route that presents the candidates in `@expo/ui`'s universal `BottomSheet`.

**Tech Stack:** Hono, valibot behind Standard Schema, Drizzle, Valkey via `@repo/cache`, `@anthropic-ai/sdk`, Expo SDK 57, expo-router, `@expo/ui`, TanStack Query, Vitest + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-08-31-share-video-to-backlog-design.md`

## Global Constraints

- **Validation is valibot throughout, behind Standard Schema.** Never add a second validation library.
- **The API never calls IGDB.** Everything is served from our own Postgres.
- **Every non-2xx response is `application/problem+json` (RFC 9457).** Problem types come from the registry in `apps/api/src/problems.ts`.
- **No 5xx ever carries an exception message in `detail`.** A fixed constant string is fine; an `error.message` is not.
- **The API test suite must need no network.** Every outbound call is injected through `AppDeps` and stubbed.
- **Model: `claude-haiku-4-5`.** On this model, do **not** pass `output_config.effort` (it errors) and do **not** pass `thinking`. Both are Claude-4.6-and-later parameters.
- **`IDENTIFY_MODEL` is the override.** Default `claude-haiku-4-5`.
- **Mobile is iOS-only** (`platforms: ["ios"]` in `app.json`).
- **`PlatformColor` for every colour** except `Brand.tint`, the app's one hex literal.
- **ESM everywhere.** Intra-package imports carry the `.js` extension (`./share.js`), matching every existing file.
- **Prettier**: `printWidth: 100`, double quotes, semicolons, trailing commas. Run `pnpm format` before each commit.
- **Commit style:** conventional commits, lowercase subject, as in `git log`.

---

## File Structure

### `packages/contracts`

| File                           | Responsibility                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `src/share.ts` **(new)**       | Request schema, host allowlist, provider detection, limits, wire types. The single source of truth for what a shareable link is. |
| `src/index.ts`                 | Add the `./share.js` re-export.                                                                                                  |
| `test/share.test.ts` **(new)** | URL shapes accepted and rejected; limit bounds.                                                                                  |

### `apps/api`

| File                                  | Responsibility                                                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/share/canonicalise.ts` **(new)** | Pure URL parsing, plus the short-link resolver. **The only place a user-supplied URL is fetched — the whole SSRF surface.** |
| `src/share/oembed.ts` **(new)**       | The two keyless metadata fetches and their valibot response schema.                                                         |
| `src/share/extract.ts` **(new)**      | The Claude call, its schema, and its cache key.                                                                             |
| `src/share/identify.ts` **(new)**     | Guess-to-candidate merge and ranking. Pure over an injected search function.                                                |
| `src/share/provider.ts` **(new)**     | `createShareProvider(env)` — wires the three impure edges for production.                                                   |
| `src/routes/games.ts`                 | The new route; factor `cachedSearch` out of the `/search` handler.                                                          |
| `src/cache-keys.ts`                   | `oembedKey`, `extractKey`, and their TTLs.                                                                                  |
| `src/rate-limits.ts`, `src/app.ts`    | The fourth scope, `identify`.                                                                                               |
| `src/types.ts`                        | The `ShareProvider` port, plus `AppDeps.share` and `AppDeps.identifyModel`.                                                 |
| `src/problems.ts`                     | Add `BAD_GATEWAY` (502).                                                                                                    |
| `src/env.ts`                          | `ANTHROPIC_API_KEY`, `IDENTIFY_MODEL`.                                                                                      |
| `src/index.ts`                        | Pass `share: createShareProvider(env)`.                                                                                     |

### `apps/mobile`

| File                                                                 | Responsibility                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/features/share/extract-url.ts` **(new)**                        | Pure: shared payloads to one URL. **No react-native in its module graph**, so it tests in plain Node. |
| `src/features/share/use-shared-url.ts` **(new)**                     | `useIncomingShare()` wrapper: the URL, and a clear function.                                          |
| `src/features/share/share-sheet.tsx` **(new)**                       | The bottom sheet: header, candidate list, states.                                                     |
| `src/app/+native-intent.ts` **(new)**                                | `expo-sharing` deep link to `/shared`.                                                                |
| `src/app/shared/_layout.tsx`, `index.tsx`, `game/[id].tsx` **(new)** | The modal route group.                                                                                |
| `src/app/_layout.tsx`                                                | `Slot` to `Stack`, so a modal sibling can present over the tabs.                                      |
| `src/api/{client,endpoints,keys,hooks}.ts`                           | `"POST"`, the endpoint, the key, the hook.                                                            |
| `src/features/onboarding/pages.ts`                                   | The fifth page.                                                                                       |

---

## Task 1: Share contracts

Establishes what a shareable link is, in the one place both the API and the app can read it.

**Files:**

- Create: `packages/contracts/src/share.ts`
- Create: `packages/contracts/test/share.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

- Consumes: `integerFrom` from `./coerce.js`, `GameSummaryWire` from `./wire.js`.
- Produces:
  - `ShareProviderName = "youtube" | "tiktok"`
  - `shareHostProvider(url: string): ShareProviderName | null`
  - `shareIdentifySchema` with output `{ url: string; limit: number }`
  - `IDENTIFY_LIMIT_DEFAULT = 15`, `IDENTIFY_LIMIT_MAX = 20`, `SHARE_URL_MAX = 2048`
  - `ShareSourceWire`, `ShareIdentifyResponse`

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/test/share.test.ts`:

```ts
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { IDENTIFY_LIMIT_DEFAULT, shareHostProvider, shareIdentifySchema } from "../src/share.js";

const parse = (input: unknown) => v.safeParse(shareIdentifySchema, input);

describe("shareHostProvider", () => {
  it("recognises every YouTube shape a share sheet produces", () => {
    expect(shareHostProvider("https://www.youtube.com/watch?v=1vs0lLIRt7w")).toBe("youtube");
    expect(shareHostProvider("https://m.youtube.com/watch?v=1vs0lLIRt7w")).toBe("youtube");
    expect(shareHostProvider("https://youtu.be/1vs0lLIRt7w")).toBe("youtube");
    expect(shareHostProvider("https://www.youtube.com/shorts/abcdefghijk")).toBe("youtube");
  });

  it("recognises TikTok, long and short", () => {
    expect(shareHostProvider("https://www.tiktok.com/@user/video/7123456789012345678")).toBe(
      "tiktok",
    );
    expect(shareHostProvider("https://vm.tiktok.com/ZMabcdef/")).toBe("tiktok");
  });

  it("matches the host exactly, so a lookalike domain cannot pass", () => {
    expect(shareHostProvider("https://youtube.com.evil.test/watch?v=x")).toBeNull();
    expect(shareHostProvider("https://notyoutube.com/watch?v=x")).toBeNull();
    expect(shareHostProvider("https://evil.test/?u=https://youtube.com/watch?v=x")).toBeNull();
  });

  it("requires https, so a downgraded link cannot be fetched", () => {
    expect(shareHostProvider("http://www.youtube.com/watch?v=1vs0lLIRt7w")).toBeNull();
  });

  it("is null for anything unparseable", () => {
    expect(shareHostProvider("not a url")).toBeNull();
    expect(shareHostProvider("")).toBeNull();
  });
});

describe("shareIdentifySchema", () => {
  it("accepts a YouTube link and fills the default limit", () => {
    const result = parse({ url: "https://www.youtube.com/watch?v=1vs0lLIRt7w" });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      url: "https://www.youtube.com/watch?v=1vs0lLIRt7w",
      limit: IDENTIFY_LIMIT_DEFAULT,
    });
  });

  it("trims surrounding whitespace, which a text share carries", () => {
    const result = parse({ url: "  https://youtu.be/1vs0lLIRt7w  " });

    expect(result.success).toBe(true);
    expect(result.output?.url).toBe("https://youtu.be/1vs0lLIRt7w");
  });

  it("rejects an unsupported host, naming the url field", () => {
    const result = parse({ url: "https://vimeo.com/12345" });

    expect(result.success).toBe(false);
    expect(result.issues?.map((issue) => v.getDotPath(issue))).toContain("url");
  });

  it("rejects a limit over the cap rather than clamping it", () => {
    expect(parse({ url: "https://youtu.be/1vs0lLIRt7w", limit: 500 }).success).toBe(false);
  });

  it("rejects an unknown key, so a typo is a 422 and not silently ignored", () => {
    expect(parse({ url: "https://youtu.be/1vs0lLIRt7w", limitt: 5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @repo/contracts test
```

Expected: FAIL — `Cannot find module '../src/share.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/contracts/src/share.ts`:

```ts
import * as v from "valibot";

import { integerFrom } from "./coerce.js";
import type { GameSummaryWire } from "./wire.js";

export const SHARE_PROVIDERS = ["youtube", "tiktok"] as const;
export type ShareProviderName = (typeof SHARE_PROVIDERS)[number];

export const SHARE_URL_MAX = 2048;
export const IDENTIFY_LIMIT_DEFAULT = 15;
export const IDENTIFY_LIMIT_MAX = 20;

/**
 * Exact hosts, never suffix matching: `endsWith("youtube.com")` would accept
 * `notyoutube.com`, and a suffix check on `.youtube.com` would accept
 * `youtube.com.evil.test`. This list is the API's outbound allowlist, so a
 * loose match here is an SSRF hole.
 */
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);

/** `null` for anything we will not fetch — wrong host, wrong scheme, unparseable. */
export function shareHostProvider(url: string): ShareProviderName | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // https only: the redirect chain in `canonicalise.ts` re-checks every hop
  // through this function, so a downgrade to http is refused there too.
  if (parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) return "youtube";
  if (TIKTOK_HOSTS.has(host)) return "tiktok";

  return null;
}

export const shareIdentifySchema = v.strictObject({
  url: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(SHARE_URL_MAX),
    v.check(
      (value) => shareHostProvider(value) !== null,
      "Only https links to YouTube or TikTok are supported",
    ),
  ),
  limit: v.optional(integerFrom(1, IDENTIFY_LIMIT_MAX), IDENTIFY_LIMIT_DEFAULT),
});
export type ShareIdentifyBody = v.InferOutput<typeof shareIdentifySchema>;

export interface ShareSourceWire {
  provider: ShareProviderName;
  videoId: string;
  title: string;
  author: string | null;
}

export interface ShareIdentifyResponse {
  source: ShareSourceWire;
  /** What the extraction believed the game was called. Drives the empty-state copy. */
  guesses: string[];
  items: GameSummaryWire[];
}
```

Note there is no `v.url()` in the pipe: `shareHostProvider` already parses with
`new URL` and rejects anything unparseable, so adding `v.url()` would only
produce a second, less specific message for the same failure.

Add the export to `packages/contracts/src/index.ts`, in alphabetical position:

```ts
export * from "./backlog.js";
export * from "./coerce.js";
export * from "./games.js";
export * from "./share.js";
export * from "./wire.js";
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @repo/contracts test
pnpm --filter @repo/contracts check-types
```

Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add packages/contracts
git commit -m "feat(contracts): share link schema and wire types"
```

---

## Task 2: URL canonicalisation and oEmbed metadata

The two steps that turn a shared link into a title. This task also introduces the `AppDeps.share` port, which is what keeps the API suite offline.

**Files:**

- Create: `apps/api/src/share/canonicalise.ts`
- Create: `apps/api/src/share/oembed.ts`
- Create: `apps/api/test/share-canonicalise.test.ts`
- Create: `apps/api/test/share-oembed.test.ts`
- Modify: `apps/api/src/cache-keys.ts`
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/problems.ts`
- Modify: `apps/api/test/helpers.ts`

**Interfaces:**

- Consumes: `shareHostProvider`, `ShareProviderName` (Task 1).
- Produces:
  - `interface VideoRef { provider: ShareProviderName; videoId: string; pageUrl: string }`
  - `type Canonical = { kind: "video"; ref: VideoRef } | { kind: "shortLink"; url: string } | { kind: "unsupported" }`
  - `parseShareUrl(input: string): Canonical`
  - `resolveShortLink(url: string, fetchImpl: typeof fetch): Promise<Canonical>`
  - `MAX_REDIRECTS = 3`
  - `interface VideoMeta { title: string; author: string | null }`
  - `fetchVideoMeta(ref: VideoRef, fetchImpl: typeof fetch): Promise<VideoMeta>`
  - `class VideoGone extends Error`, `class VideoMetaUnavailable extends Error`
  - `interface ShareProvider { resolveShortLink(url): Promise<Canonical>; fetchMeta(ref): Promise<VideoMeta>; extractTitles(meta): Promise<string[]> }`
  - `oembedKey(provider, videoId): string`, `OEMBED_TTL_SECONDS = 604_800`

- [ ] **Step 1: Write the failing canonicalisation test**

Create `apps/api/test/share-canonicalise.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { MAX_REDIRECTS, parseShareUrl, resolveShortLink } from "../src/share/canonicalise.js";

describe("parseShareUrl", () => {
  it("reads a watch URL, dropping tracking parameters", () => {
    const result = parseShareUrl("https://www.youtube.com/watch?v=1vs0lLIRt7w&t=42s&si=abc");

    expect(result).toEqual({
      kind: "video",
      ref: {
        provider: "youtube",
        videoId: "1vs0lLIRt7w",
        pageUrl: "https://www.youtube.com/watch?v=1vs0lLIRt7w",
      },
    });
  });

  it("reads a youtu.be short URL", () => {
    expect(parseShareUrl("https://youtu.be/1vs0lLIRt7w?t=42")).toMatchObject({
      kind: "video",
      ref: { videoId: "1vs0lLIRt7w" },
    });
  });

  it("reads a Shorts URL", () => {
    expect(parseShareUrl("https://www.youtube.com/shorts/1vs0lLIRt7w")).toMatchObject({
      kind: "video",
      ref: { videoId: "1vs0lLIRt7w" },
    });
  });

  it("reads a TikTok video URL and keeps the creator path, which oEmbed needs", () => {
    const result = parseShareUrl("https://www.tiktok.com/@snam/video/7123456789012345678?is=1");

    expect(result).toEqual({
      kind: "video",
      ref: {
        provider: "tiktok",
        videoId: "7123456789012345678",
        pageUrl: "https://www.tiktok.com/@snam/video/7123456789012345678",
      },
    });
  });

  it("defers a TikTok short link, which oEmbed will not accept", () => {
    expect(parseShareUrl("https://vm.tiktok.com/ZMabcdef/")).toEqual({
      kind: "shortLink",
      url: "https://vm.tiktok.com/ZMabcdef/",
    });
    expect(parseShareUrl("https://www.tiktok.com/t/ZMabcdef/")).toMatchObject({
      kind: "shortLink",
    });
  });

  it("is unsupported for a wrong host, a wrong scheme, or a malformed id", () => {
    expect(parseShareUrl("https://vimeo.com/12345")).toEqual({ kind: "unsupported" });
    expect(parseShareUrl("http://www.youtube.com/watch?v=1vs0lLIRt7w")).toEqual({
      kind: "unsupported",
    });
    expect(parseShareUrl("https://www.youtube.com/watch?v=tooshort")).toEqual({
      kind: "unsupported",
    });
    expect(parseShareUrl("https://www.youtube.com/feed/subscriptions")).toEqual({
      kind: "unsupported",
    });
  });
});

describe("resolveShortLink", () => {
  const redirectTo = (location: string) =>
    new Response(null, { status: 301, headers: { location } });

  it("follows one hop to the canonical video URL", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectTo("https://www.tiktok.com/@snam/video/7123456789012345678"),
    ) as unknown as typeof fetch;

    const result = await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl);

    expect(result).toMatchObject({ kind: "video", ref: { videoId: "7123456789012345678" } });
  });

  it("refuses a redirect that leaves the allowlisted hosts", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectTo("https://evil.test/@snam/video/7123456789012345678"),
    ) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unsupported",
    });
  });

  it("refuses a downgrade to http", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectTo("http://www.tiktok.com/@snam/video/7123456789012345678"),
    ) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unsupported",
    });
  });

  it("gives up after the hop cap rather than following a redirect loop", async () => {
    const fetchImpl = vi.fn(async () =>
      redirectTo("https://vm.tiktok.com/ZMabcdef/"),
    ) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unsupported",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_REDIRECTS);
  });

  it("is unsupported when the response carries no Location", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await resolveShortLink("https://vm.tiktok.com/ZMabcdef/", fetchImpl)).toEqual({
      kind: "unsupported",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter api test share-canonicalise
```

Expected: FAIL — `Cannot find module '../src/share/canonicalise.js'`.

- [ ] **Step 3: Implement canonicalisation**

Create `apps/api/src/share/canonicalise.ts`:

```ts
import { shareHostProvider, type ShareProviderName } from "@repo/contracts";

export interface VideoRef {
  provider: ShareProviderName;
  videoId: string;
  /** The canonical page URL, which is what an oEmbed endpoint is asked about. */
  pageUrl: string;
}

export type Canonical =
  { kind: "video"; ref: VideoRef } | { kind: "shortLink"; url: string } | { kind: "unsupported" };

const UNSUPPORTED: Canonical = { kind: "unsupported" };

const YOUTUBE_ID = /^[\w-]{11}$/;
const TIKTOK_ID = /^\d{6,25}$/;
const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

/** Three hops is generous for a link shortener and short enough to bound a loop. */
export const MAX_REDIRECTS = 3;

function youtubeId(url: URL): string | null {
  const segments = url.pathname.split("/").filter((segment) => segment !== "");

  if (url.hostname.toLowerCase() === "youtu.be") return segments[0] ?? null;
  if (segments[0] === "shorts") return segments[1] ?? null;
  if (url.pathname === "/watch") return url.searchParams.get("v");

  return null;
}

/**
 * Pure. Returns `shortLink` — rather than resolving it — so the only network
 * call lives in `resolveShortLink`, where the per-hop host check is.
 */
export function parseShareUrl(input: string): Canonical {
  const provider = shareHostProvider(input);
  if (provider === null) return UNSUPPORTED;

  const url = new URL(input);
  const host = url.hostname.toLowerCase();

  if (provider === "youtube") {
    const videoId = youtubeId(url);
    if (videoId === null || !YOUTUBE_ID.test(videoId)) return UNSUPPORTED;

    // Rebuilt, not passed through: this drops `t`, `si` and every other
    // tracking parameter, so two shares of the same video hit the same cache key.
    return {
      kind: "video",
      ref: {
        provider,
        videoId,
        pageUrl: `https://www.youtube.com/watch?v=${videoId}`,
      },
    };
  }

  const segments = url.pathname.split("/").filter((segment) => segment !== "");

  if (TIKTOK_SHORT_HOSTS.has(host) || segments[0] === "t") {
    return { kind: "shortLink", url: input };
  }

  // `/@creator/video/:id`. The creator segment is kept: TikTok's oEmbed is
  // asked about the page, not the id.
  const [creator, kind, videoId] = segments;
  if (creator?.startsWith("@") !== true || kind !== "video" || videoId === undefined) {
    return UNSUPPORTED;
  }
  if (!TIKTOK_ID.test(videoId)) return UNSUPPORTED;

  return {
    kind: "video",
    ref: {
      provider,
      videoId,
      pageUrl: `https://www.tiktok.com/${creator}/video/${videoId}`,
    },
  };
}

/**
 * The only place Barklog fetches a user-supplied URL, and therefore the whole
 * SSRF surface. Three constraints, all of them load-bearing:
 *
 *  - every hop's host must pass `shareHostProvider`, which is an exact-match
 *    allowlist and https-only, so a redirect cannot walk off TikTok or downgrade;
 *  - `redirect: "manual"`, so undici never follows a hop we have not checked;
 *  - at most `MAX_REDIRECTS` hops, so a shortener loop terminates.
 */
export async function resolveShortLink(url: string, fetchImpl: typeof fetch): Promise<Canonical> {
  let current = url;

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    // Before the fetch, every time — including the caller's own URL.
    if (shareHostProvider(current) === null) return UNSUPPORTED;

    const response = await fetchImpl(current, { method: "GET", redirect: "manual" });
    const location = response.headers.get("location");
    if (location === null) return UNSUPPORTED;

    current = new URL(location, current).toString();

    const parsed = parseShareUrl(current);
    if (parsed.kind !== "shortLink") return parsed;
  }

  return UNSUPPORTED;
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter api test share-canonicalise
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Write the failing oEmbed test**

Create `apps/api/test/share-oembed.test.ts`:

```ts
import { expect, it, vi } from "vitest";

import type { VideoRef } from "../src/share/canonicalise.js";
import { fetchVideoMeta, VideoGone, VideoMetaUnavailable } from "../src/share/oembed.js";

const YOUTUBE: VideoRef = {
  provider: "youtube",
  videoId: "1vs0lLIRt7w",
  pageUrl: "https://www.youtube.com/watch?v=1vs0lLIRt7w",
};

const TIKTOK: VideoRef = {
  provider: "tiktok",
  videoId: "7123456789012345678",
  pageUrl: "https://www.tiktok.com/@snam/video/7123456789012345678",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

it("asks YouTube's endpoint about the page URL and returns title and author", async () => {
  const fetchImpl = vi.fn(async () =>
    json({
      title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
      author_name: "Snamwiches",
    }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(YOUTUBE, fetchImpl)).toEqual({
    title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
    author: "Snamwiches",
  });

  const [calledUrl] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(calledUrl)).toBe(
    "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D1vs0lLIRt7w&format=json",
  );
});

it("asks TikTok's endpoint, and tolerates a missing author", async () => {
  const fetchImpl = vi.fn(async () =>
    json({ title: "beating this boss #residentevil" }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(TIKTOK, fetchImpl)).toEqual({
    title: "beating this boss #residentevil",
    author: null,
  });
  expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toContain("tiktok.com/oembed");
});

it.each([401, 403, 404])("treats %i as a gone video, not an outage", async (status) => {
  const fetchImpl = vi.fn(async () => json({}, status)) as unknown as typeof fetch;

  await expect(fetchVideoMeta(YOUTUBE, fetchImpl)).rejects.toThrow(VideoGone);
});

it("treats a 500 as an outage", async () => {
  const fetchImpl = vi.fn(async () => json({}, 500)) as unknown as typeof fetch;

  await expect(fetchVideoMeta(YOUTUBE, fetchImpl)).rejects.toThrow(VideoMetaUnavailable);
});

it("rejects a 200 whose body does not match the schema, rather than passing undefined on", async () => {
  const fetchImpl = vi.fn(async () => json({ status_code: 10101 })) as unknown as typeof fetch;

  await expect(fetchVideoMeta(TIKTOK, fetchImpl)).rejects.toThrow(VideoMetaUnavailable);
});

it("rejects an empty title, which TikTok returns for a removed video", async () => {
  const fetchImpl = vi.fn(async () => json({ title: "   " })) as unknown as typeof fetch;

  await expect(fetchVideoMeta(TIKTOK, fetchImpl)).rejects.toThrow(VideoMetaUnavailable);
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
pnpm --filter api test share-oembed
```

Expected: FAIL — `Cannot find module '../src/share/oembed.js'`.

- [ ] **Step 7: Implement oEmbed**

Create `apps/api/src/share/oembed.ts`:

```ts
import type { ShareProviderName } from "@repo/contracts";
import * as v from "valibot";

import type { VideoRef } from "./canonicalise.js";

export interface VideoMeta {
  title: string;
  author: string | null;
}

/** The video is private, removed, or never existed. A 404 for the caller. */
export class VideoGone extends Error {}

/** The metadata step failed and may succeed later. A 502 for the caller. */
export class VideoMetaUnavailable extends Error {}

export const OEMBED_TIMEOUT_MS = 5_000;

/** Compile-time constants. Nothing user-supplied ever reaches this map. */
const ENDPOINTS: Record<ShareProviderName, string> = {
  youtube: "https://www.youtube.com/oembed",
  tiktok: "https://www.tiktok.com/oembed",
};

/**
 * `minLength(1)` after `trim` is not pedantry: TikTok answers 200 with a
 * blank or absent title for a removed video, and without this the pipeline
 * would send whitespace to the extraction step and pay for it.
 */
const oembedSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1)),
  author_name: v.optional(v.pipe(v.string(), v.trim())),
});

export async function fetchVideoMeta(ref: VideoRef, fetchImpl: typeof fetch): Promise<VideoMeta> {
  const url = `${ENDPOINTS[ref.provider]}?url=${encodeURIComponent(ref.pageUrl)}&format=json`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new VideoMetaUnavailable(`${ref.provider} oEmbed did not answer`, { cause });
  }

  // Not `!response.ok`: these three mean the video is gone, which is the
  // caller's 404, while everything else is our 502.
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new VideoGone(`${ref.provider} oEmbed answered ${response.status}`);
  }
  if (!response.ok) {
    throw new VideoMetaUnavailable(`${ref.provider} oEmbed answered ${response.status}`);
  }

  const body: unknown = await response.json().catch(() => null);
  const parsed = v.safeParse(oembedSchema, body);
  if (!parsed.success) {
    throw new VideoMetaUnavailable(`${ref.provider} oEmbed payload did not match the schema`);
  }

  const author = parsed.output.author_name;

  return {
    title: parsed.output.title,
    author: author === undefined || author === "" ? null : author,
  };
}
```

- [ ] **Step 8: Run it to verify it passes**

```bash
pnpm --filter api test share-oembed
```

Expected: PASS, 8 tests (the `it.each` counts three).

- [ ] **Step 9: Add the cache keys, the 502 problem, and the `share` port**

In `apps/api/src/cache-keys.ts`, append:

```ts
/** A published video's title effectively never changes. */
export const OEMBED_TTL_SECONDS = 604_800;

export function oembedKey(provider: string, videoId: string): string {
  return `oembed:${provider}:${videoId}`;
}
```

In `apps/api/src/problems.ts`, add one line to the registry, keeping it in
ascending status order:

```ts
export const problems = createProblemTypeRegistry({
  UNAUTHORIZED: definition(401),
  NOT_FOUND: definition(404),
  CONTENT_TOO_LARGE: definition(413),
  UNSUPPORTED_MEDIA_TYPE: definition(415),
  TOO_MANY_REQUESTS: definition(429),
  BAD_GATEWAY: definition(502),
  SERVICE_UNAVAILABLE: definition(503),
});
```

`mapError` strips `detail` only from an `HTTPException`, so a `BAD_GATEWAY`
created here keeps whatever `detail` we pass. That is safe **only** because
every call site passes a fixed constant string — never `error.message`. Do not
interpolate an exception into it.

In `apps/api/src/types.ts`, add the port and the dep:

```ts
import type { Canonical, VideoRef } from "./share/canonicalise.js";
import type { VideoMeta } from "./share/oembed.js";

/**
 * The three impure edges of the identify pipeline, injected so the test suite
 * needs no network — the same reason `auth: AuthProvider` is a dep.
 * `parseShareUrl` is deliberately absent: it is pure, so tests exercise the
 * real one.
 */
export interface ShareProvider {
  resolveShortLink(url: string): Promise<Canonical>;
  fetchMeta(ref: VideoRef): Promise<VideoMeta>;
  extractTitles(meta: VideoMeta): Promise<string[]>;
}
```

and add `share: ShareProvider;` to `AppDeps`.

In `apps/api/test/helpers.ts`, give `createTestApp` a default so the existing
suites keep compiling. It throws rather than returning empty data, so a test
that reaches the pipeline without meaning to fails loudly:

```ts
import type { AppDeps, Db, ShareProvider } from "../src/types.js";

const unusedShareProvider: ShareProvider = {
  resolveShortLink: () => {
    throw new Error("share.resolveShortLink was not stubbed for this test");
  },
  fetchMeta: () => {
    throw new Error("share.fetchMeta was not stubbed for this test");
  },
  extractTitles: () => {
    throw new Error("share.extractTitles was not stubbed for this test");
  },
};
```

and in the `createApp` call, above `...overrides`:

```ts
const app = createApp({
  db,
  cache,
  auth: fakeAuthProvider,
  share: unusedShareProvider,
  production: true,
  ...overrides,
});
```

- [ ] **Step 10: Run the whole API suite to confirm nothing regressed**

```bash
pnpm --filter api test
pnpm --filter api check-types
```

Expected: PASS. `check-types` is the one that proves `AppDeps.share` did not
break another call site.

- [ ] **Step 11: Commit**

```bash
pnpm format
git add apps/api packages/contracts
git commit -m "feat(api): canonicalise share links and read oEmbed metadata"
```

---

## Task 3: Title extraction with Claude

**Files:**

- Create: `apps/api/src/share/extract.ts`
- Create: `apps/api/test/share-extract.test.ts`
- Modify: `apps/api/src/cache-keys.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/test/env.test.ts`
- Modify: `apps/api/package.json`
- Modify: `turbo.json`

**Interfaces:**

- Consumes: `VideoMeta` (Task 2).
- Produces:
  - `createTitleExtractor(options: { apiKey: string; model: string }): (meta: VideoMeta) => Promise<string[]>`
  - `EXTRACT_PROMPT_VERSION = 1`, `EXTRACT_TTL_SECONDS = 2_592_000`
  - `extractKey(promptVersion: number, model: string, provider: string, videoId: string): string`
  - `MAX_GUESSES = 3`

- [ ] **Step 1: Add the dependency and the environment**

```bash
pnpm --filter api add @anthropic-ai/sdk
```

In `apps/api/src/env.ts`, add two entries to `envSchema`:

```ts
  ANTHROPIC_API_KEY: required,
  IDENTIFY_MODEL: v.optional(required, "claude-haiku-4-5"),
```

`ANTHROPIC_API_KEY` is **required**, not optional. Extraction fails soft at
request time, but a deployment with no key would fail soft on every single
share — a silent, permanent degradation. Better to refuse to boot.

Append to `apps/api/.env.example`:

```
# Anthropic — https://console.anthropic.com, API keys
ANTHROPIC_API_KEY=
# Optional. Defaults to claude-haiku-4-5.
IDENTIFY_MODEL=
```

Add `ANTHROPIC_API_KEY` and `IDENTIFY_MODEL` to the `env` array of **all four**
tasks in `turbo.json` that already list `CLERK_SECRET_KEY` — `build`, `test`,
`dev` and `start`. Missing one causes `turbo/no-undeclared-env-vars` to fail lint.

In `apps/api/test/env.test.ts`, add the key to the `VALID` fixture and one test:

```ts
const VALID = {
  DATABASE_URL: "postgres://barklog:barklog@localhost:5432/barklog",
  VALKEY_URL: "redis://localhost:6379",
  CLERK_SECRET_KEY: "sk_test_x",
  CLERK_PUBLISHABLE_KEY: "pk_test_x",
  ANTHROPIC_API_KEY: "sk-ant-test-x",
};
```

The first test asserts `toEqual({ ...VALID, PORT: 3000, ... })`, so add
`IDENTIFY_MODEL: "claude-haiku-4-5"` to that expected object. Then:

```ts
test("a missing Anthropic key stops the process at boot, since every share would degrade", () => {
  expect(() => parseEnv({ ...VALID, ANTHROPIC_API_KEY: undefined })).toThrow(/ANTHROPIC_API_KEY/);
});
```

- [ ] **Step 2: Write the failing extraction test**

Create `apps/api/test/share-extract.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { extractKey, MAX_GUESSES, parseExtraction } from "../src/share/extract.js";

describe("parseExtraction", () => {
  it("reads the titles out of a well-formed response", () => {
    expect(parseExtraction('{"titles":["Resident Evil 2","Resident Evil"]}')).toEqual([
      "Resident Evil 2",
      "Resident Evil",
    ]);
  });

  it("caps the list, so a chatty response cannot fan out into extra searches", () => {
    const many = JSON.stringify({ titles: ["a", "b", "c", "d", "e"] });

    expect(parseExtraction(many)).toHaveLength(MAX_GUESSES);
  });

  it("drops blank entries and trims the rest", () => {
    expect(parseExtraction('{"titles":["  Hades  ","","   "]}')).toEqual(["Hades"]);
  });

  it("returns an empty list when the model found no game", () => {
    expect(parseExtraction('{"titles":[]}')).toEqual([]);
  });

  it("throws on unparseable output rather than returning nothing, so the caller can fail soft", () => {
    expect(() => parseExtraction("not json")).toThrow();
    expect(() => parseExtraction('{"games":["Hades"]}')).toThrow();
    expect(() => parseExtraction('{"titles":"Hades"}')).toThrow();
  });
});

describe("extractKey", () => {
  it("carries the prompt version and the model, so neither survives a change", () => {
    expect(extractKey(1, "claude-haiku-4-5", "youtube", "1vs0lLIRt7w")).toBe(
      "extract:v1:claude-haiku-4-5:youtube:1vs0lLIRt7w",
    );
  });

  it("changes when the model changes", () => {
    expect(extractKey(1, "claude-haiku-4-5", "youtube", "x")).not.toBe(
      extractKey(1, "claude-opus-5", "youtube", "x"),
    );
  });

  it("changes when the prompt version changes", () => {
    expect(extractKey(1, "m", "youtube", "x")).not.toBe(extractKey(2, "m", "youtube", "x"));
  });
});
```

Note what is **not** tested here: the SDK call itself. `parseExtraction` is the
part with logic, and it is pure. The wiring is covered end-to-end by the route
test in Task 4, where `extractTitles` is stubbed.

- [ ] **Step 3: Run it to verify it fails**

```bash
pnpm --filter api test share-extract
```

Expected: FAIL — `Cannot find module '../src/share/extract.js'`.

- [ ] **Step 4: Implement extraction**

Create `apps/api/src/share/extract.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { getLogger } from "@logtape/logtape";
import * as v from "valibot";

import type { VideoMeta } from "./oembed.js";

const log = getLogger(["api", "share"]);

/** Bump on any prompt edit: it is part of the cache key. */
export const EXTRACT_PROMPT_VERSION = 1;

/** Deterministic given the metadata, and the metadata is cached for 7 days. */
export const EXTRACT_TTL_SECONDS = 2_592_000;

/** Each guess costs one mirror search, so the fan-out is bounded here. */
export const MAX_GUESSES = 3;

const MAX_TOKENS = 256;

export function extractKey(
  promptVersion: number,
  model: string,
  provider: string,
  videoId: string,
): string {
  return `extract:v${promptVersion}:${model}:${provider}:${videoId}`;
}

const SYSTEM = `You identify which video game a short video is about, from its title and channel name.

Reply with the game's canonical English title as a games database would list it, not as the video spells it. Expand abbreviations and nicknames: "RE2" is "Resident Evil 2", "BOTW" is "The Legend of Zelda: Breath of the Wild", "GTA V" is "Grand Theft Auto V".

Give up to ${MAX_GUESSES} titles, most likely first. When a title could mean an original or its remake, list both, original first. When the text names no game at all, return an empty list rather than guessing from the channel's usual subject.`;

const responseSchema = v.object({
  titles: v.array(v.pipe(v.string(), v.trim())),
});

/**
 * Separated from the API call so the parsing rules are testable without a
 * network or a key. Throws on anything unexpected: the caller fails soft, and
 * a throw is what keeps the bad answer out of the cache.
 */
export function parseExtraction(raw: string): string[] {
  // JSON.parse, never a string match: structured output may escape unicode or
  // forward slashes differently from one model to the next.
  const parsed = v.parse(responseSchema, JSON.parse(raw));

  return parsed.titles.filter((title) => title !== "").slice(0, MAX_GUESSES);
}

export function createTitleExtractor(options: {
  apiKey: string;
  model: string;
}): (meta: VideoMeta) => Promise<string[]> {
  const client = new Anthropic({ apiKey: options.apiKey });

  return async function extractTitles(meta: VideoMeta): Promise<string[]> {
    const author = meta.author === null ? "" : `\nChannel: ${meta.author}`;

    const response = await client.messages.create({
      model: options.model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      // No `thinking` and no `output_config.effort`: on claude-haiku-4-5,
      // omitting `thinking` means no thinking (which is what a sub-second
      // extraction wants), and `effort` is a 4.6-and-later parameter that
      // errors on this model. Both come back if IDENTIFY_MODEL moves to Opus.
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              titles: {
                type: "array",
                items: { type: "string" },
                // No `maxItems`: Anthropic's structured-output schema subset
                // rejects it on arrays with a 400. `parseExtraction` caps the
                // result to MAX_GUESSES instead.
              },
            },
            required: ["titles"],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: "user", content: `Video title: ${meta.title}${author}` }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const titles = parseExtraction(text);

    log.debug("extracted {count} title(s) from {title}", {
      count: titles.length,
      title: meta.title,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return titles;
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
pnpm --filter api test share-extract
pnpm --filter api test env
pnpm --filter api check-types
pnpm lint
```

Expected: PASS on both suites, no type errors, no lint failures. If lint
complains about an undeclared env var, a `turbo.json` task was missed in Step 1.

- [ ] **Step 6: Commit**

```bash
pnpm format
git add apps/api turbo.json pnpm-lock.yaml
git commit -m "feat(api): extract game titles from video metadata with claude"
```

---

## Task 4: The identify route

**Files:**

- Create: `apps/api/src/share/identify.ts`
- Create: `apps/api/src/share/provider.ts`
- Create: `apps/api/test/share-identify.test.ts`
- Create: `apps/api/test/identify-routes.test.ts`
- Modify: `apps/api/src/routes/games.ts`
- Modify: `apps/api/src/rate-limits.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/problems.ts` (adds `UNPROCESSABLE_SHARE`)
- Modify: `apps/api/src/types.ts` (adds `AppDeps.identifyModel`)
- Modify: `apps/api/test/helpers.ts` (defaults `identifyModel`)
- Modify: `apps/api/src/index.ts`

**Interfaces:**

- Consumes: everything from Tasks 1–3, plus `searchGames` and `GameSummary` from `@repo/db`, `toGameSummary` from `../serialize.js`.
- Produces:
  - `mergeCandidates(results: GameSummaryWire[][], limit: number): GameSummaryWire[]`
  - `PER_GUESS_LIMIT = 8`
  - `createShareProvider(env, fetchImpl?): ShareProvider`
  - `RateLimitScope` gains `"identify"`
  - `AppDeps.identifyModel: string` — the route builds the extraction cache key,
    so the route has to know which model produced it
  - `problems` gains `UNPROCESSABLE_SHARE` (422)

- [ ] **Step 1: Write the failing merge test**

Create `apps/api/test/share-identify.test.ts`:

```ts
import { expect, it } from "vitest";

import type { GameSummaryWire } from "../src/serialize.js";
import { mergeCandidates } from "../src/share/identify.js";

const game = (id: number): GameSummaryWire => ({
  id,
  name: `Game ${id}`,
  slug: `game-${id}`,
  coverImageId: null,
  firstReleaseDate: null,
  totalRating: null,
  totalRatingCount: 0,
});

it("keeps guess order, so the first guess's matches rank above the second's", () => {
  const merged = mergeCandidates([[game(1), game(2)], [game(3)]], 10);

  expect(merged.map((item) => item.id)).toEqual([1, 2, 3]);
});

it("dedupes by id, keeping the earliest position", () => {
  const merged = mergeCandidates(
    [
      [game(1), game(2)],
      [game(2), game(3)],
    ],
    10,
  );

  expect(merged.map((item) => item.id)).toEqual([1, 2, 3]);
});

it("caps at the limit", () => {
  const merged = mergeCandidates([[game(1), game(2), game(3)]], 2);

  expect(merged.map((item) => item.id)).toEqual([1, 2]);
});

it("is empty for no guesses", () => {
  expect(mergeCandidates([], 10)).toEqual([]);
});

it("skips a guess that matched nothing without disturbing the order", () => {
  const merged = mergeCandidates([[], [game(7)]], 10);

  expect(merged.map((item) => item.id)).toEqual([7]);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter api test share-identify
```

Expected: FAIL — `Cannot find module '../src/share/identify.js'`.

- [ ] **Step 3: Implement the merge and the production provider**

Create `apps/api/src/share/identify.ts`:

```ts
import type { GameSummaryWire } from "../serialize.js";

/** Each guess is searched at this limit; three guesses give at most 24 rows in. */
export const PER_GUESS_LIMIT = 8;

/**
 * No scoring arithmetic. The guesses arrive ordered by the model, and
 * `searchGames` already ranks within a guess by similarity and popularity, so
 * concatenating in order and deduping is the whole ranking.
 */
export function mergeCandidates(results: GameSummaryWire[][], limit: number): GameSummaryWire[] {
  const seen = new Set<number>();
  const merged: GameSummaryWire[] = [];

  for (const group of results) {
    for (const item of group) {
      if (seen.has(item.id)) continue;

      seen.add(item.id);
      merged.push(item);

      if (merged.length === limit) return merged;
    }
  }

  return merged;
}
```

Create `apps/api/src/share/provider.ts`:

```ts
import type { ShareProvider } from "../types.js";
import { resolveShortLink } from "./canonicalise.js";
import { createTitleExtractor } from "./extract.js";
import { fetchVideoMeta } from "./oembed.js";

/**
 * The production wiring for the three impure edges. `fetchImpl` is a parameter
 * so a future integration test can drive real canonicalisation against a
 * recorded server without reaching the internet.
 */
export function createShareProvider(
  env: { ANTHROPIC_API_KEY: string; IDENTIFY_MODEL: string },
  fetchImpl: typeof fetch = fetch,
): ShareProvider {
  return {
    resolveShortLink: (url) => resolveShortLink(url, fetchImpl),
    fetchMeta: (ref) => fetchVideoMeta(ref, fetchImpl),
    extractTitles: createTitleExtractor({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.IDENTIFY_MODEL,
    }),
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
pnpm --filter api test share-identify
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Add the rate-limit scope**

In `apps/api/src/rate-limits.ts`:

```ts
export type RateLimitScope = "search" | "identify" | "write" | "overall";
```

and in `DEFAULT_RATE_LIMITS`:

```ts
  // Tighter than `search`: one call costs an outbound HTTP round trip and an
  // LLM call, so it is the only route where a burst has a per-request cost.
  identify: { limit: 10, windowSeconds: 60 },
```

In `apps/api/src/app.ts`, register it immediately after the `search` scope, so
the most specific scope still comes first:

```ts
    .use("/api/games/search", rateLimit(deps.cache, "search", limits.search))
    .post("/api/games/identify", rateLimit(deps.cache, "identify", limits.identify))
```

`.post`, not `.use`: the route exists only as a POST, and binding the method
here means a future `GET /api/games/identify` cannot silently inherit this
scope.

- [ ] **Step 6: Write the failing route test**

Create `apps/api/test/identify-routes.test.ts`:

```ts
import { afterAll, beforeEach, expect, test, vi } from "vitest";

import type { Canonical, VideoRef } from "../src/share/canonicalise.js";
import type { VideoMeta } from "../src/share/oembed.js";
import { VideoGone, VideoMetaUnavailable } from "../src/share/oembed.js";
import type { ShareProvider } from "../src/types.js";
import { callApi, createTestApp, seedGame } from "./helpers.js";

const RE2_URL = "https://www.youtube.com/watch?v=1vs0lLIRt7w";

const META: VideoMeta = {
  title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
  author: "Snamwiches",
};

function shareStub(overrides: Partial<ShareProvider> = {}): ShareProvider {
  return {
    resolveShortLink: async (): Promise<Canonical> => ({ kind: "unsupported" }),
    fetchMeta: async (_ref: VideoRef) => META,
    extractTitles: async () => ["Resident Evil 2"],
    ...overrides,
  };
}

const extractTitles = vi.fn(async () => ["Resident Evil 2"]);

const harness = createTestApp({ share: shareStub({ extractTitles }) });

beforeEach(async () => {
  await harness.reset();
  extractTitles.mockClear();
});

afterAll(async () => {
  await harness.close();
});

const identify = (body: unknown, init: { user?: string | null } = {}) =>
  callApi(harness.app, "/api/games/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });

test("identifies the game, returning ranked candidates and the video it came from", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });
  await seedGame(harness.db, { id: 2, name: "Resident Evil 2 Remake Mod", count: 4 });
  await seedGame(harness.db, { id: 3, name: "Hades", count: 900 });

  const response = await identify({ url: RE2_URL });
  const body = (await response.json()) as {
    source: { provider: string; videoId: string; title: string; author: string | null };
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
  });
  expect(body.guesses).toEqual(["Resident Evil 2"]);
  expect(body.items.map((item) => item.id)).toEqual([1, 2]);
});

test("an unsupported host is 422, naming the url field", async () => {
  const response = await identify({ url: "https://vimeo.com/12345" });
  const body = (await response.json()) as { errors: { field: string }[] };

  expect(response.status).toBe(422);
  expect(body.errors[0]?.field).toBe("url");
});

test("a supported host that is not a video page is 422", async () => {
  const response = await identify({ url: "https://www.youtube.com/feed/subscriptions" });

  expect(response.status).toBe(422);
});

test("a gone video is 404, not a 502", async () => {
  const app = createTestApp({
    share: shareStub({
      fetchMeta: async () => {
        throw new VideoGone("410");
      },
    }),
  });

  const response = await callApi(app.app, "/api/games/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: RE2_URL }),
  });

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

  const response = await callApi(app.app, "/api/games/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: RE2_URL }),
  });
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
        throw new Error("anthropic is down");
      },
    }),
  });

  const response = await callApi(app.app, "/api/games/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: RE2_URL }),
  });
  const body = (await response.json()) as { guesses: string[] };

  expect(response.status).toBe(200);
  expect(body.guesses).toEqual([META.title]);
  await app.close();
});

test("a failed extraction is not cached, so the next call retries it", async () => {
  let calls = 0;
  const app = createTestApp({
    share: shareStub({
      extractTitles: async () => {
        calls += 1;
        throw new Error("anthropic is down");
      },
    }),
  });

  const send = () =>
    callApi(app.app, "/api/games/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: RE2_URL }),
    });

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
  const response = await callApi(harness.app, "/api/games/identify", {
    method: "POST",
    body: JSON.stringify({ url: RE2_URL }),
  });

  expect(response.status).toBe(415);
});

test("the identify scope is tighter than the overall one", async () => {
  const app = createTestApp({
    share: shareStub(),
    rateLimits: { identify: { limit: 2, windowSeconds: 60 } },
  });

  const send = () =>
    callApi(app.app, "/api/games/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: RE2_URL }),
    });

  expect((await send()).status).toBe(200);
  expect((await send()).status).toBe(200);

  const limited = await send();
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBeTruthy();
  await app.close();
});
```

- [ ] **Step 7: Run it to verify it fails**

```bash
pnpm --filter api test identify-routes
```

Expected: FAIL — every test 404s, because the route does not exist.

- [ ] **Step 8: Factor out `cachedSearch`, then add the route**

In `apps/api/src/routes/games.ts`, add these imports:

Add `shareIdentifySchema` and `type ShareIdentifyResponse` to the **existing**
`@repo/contracts` import block, and `OEMBED_TTL_SECONDS` and `oembedKey` to the
**existing** `../cache-keys.js` block. Two import statements from one module
trips `no-duplicate-imports`, and `pnpm lint` runs with `--max-warnings 0`.

Then add these new blocks:

```ts
import { parseShareUrl, type Canonical } from "../share/canonicalise.js";
import { EXTRACT_PROMPT_VERSION, EXTRACT_TTL_SECONDS, extractKey } from "../share/extract.js";
import { mergeCandidates, PER_GUESS_LIMIT } from "../share/identify.js";
import { VideoGone } from "../share/oembed.js";
```

`IDENTIFY_LIMIT_DEFAULT` is deliberately **not** imported: the limit arrives
already defaulted by the schema, so importing it would be an unused binding.

Inside `gamesRoutes`, above the `feed` helper, lift the search-and-cache block
out of the `/search` handler so both routes share it:

```ts
const cachedSearch = async (
  query: string,
  limit: number,
  offset: number,
): Promise<GameSummaryWire[]> =>
  withCache<GameSummaryWire[]>(
    deps.cache,
    searchKey(await searchVersion(), query, limit, offset),
    (value) => (value.length === 0 ? EMPTY_SEARCH_TTL_SECONDS : SEARCH_TTL_SECONDS),
    async () => (await searchGames(deps.db, { query, limit, offset })).map(toGameSummary),
  );
```

The `/search` handler then becomes:

```ts
    .get("/search", sValidator("query", searchQuerySchema, onInvalid), async (c) => {
      const { q, limit, offset } = c.req.valid("query");
      const items = await cachedSearch(normaliseQuery(q), limit, offset);

      c.header("Cache-Control", "private, max-age=60");
      return c.json({ items });
    })
```

Then add the identify handler. Put it **above** `.get("/:id", …)` so the file
reads specific-to-general like the rest of the chain:

```ts
    .post("/identify", sValidator("json", shareIdentifySchema, onInvalid), async (c) => {
      const { url, limit } = c.req.valid("json");

      // Pure first: a short link is the only shape that needs a network hop,
      // so an ordinary link never pays for one.
      let canonical: Canonical = parseShareUrl(url);
      if (canonical.kind === "shortLink") {
        canonical = await deps.share.resolveShortLink(canonical.url);
      }

      if (canonical.kind !== "video") {
        // A recognised host whose path is not a video page. The schema cannot
        // catch this — it validates the host, not the route within it.
        throw problems.create("UNPROCESSABLE_SHARE", {
          detail: "That link is not a YouTube or TikTok video page.",
        });
      }

      const { ref } = canonical;

      let meta;
      try {
        meta = await withCache(
          deps.cache,
          oembedKey(ref.provider, ref.videoId),
          OEMBED_TTL_SECONDS,
          () => deps.share.fetchMeta(ref),
        );
      } catch (error) {
        if (error instanceof VideoGone) {
          throw problems.create("NOT_FOUND", {
            detail: "That video is unavailable — it may be private or removed.",
          });
        }
        // A fixed string: a 5xx must never carry the upstream message.
        throw problems.create("BAD_GATEWAY", {
          detail: "The video could not be read right now. Try again shortly.",
        });
      }

      // The catch sits outside `withCache`, deliberately. A throw inside the
      // loader propagates uncached — the same property `/:id/similar` relies on
      // — so one transient failure cannot pin a degraded answer for 30 days.
      let guesses: string[];
      try {
        guesses = await withCache(
          deps.cache,
          extractKey(EXTRACT_PROMPT_VERSION, deps.identifyModel, ref.provider, ref.videoId),
          EXTRACT_TTL_SECONDS,
          () => deps.share.extractTitles(meta),
        );
      } catch {
        // Fail soft: the raw title is a worse query than an extracted one, but
        // it is a far better answer than an error page.
        guesses = [meta.title];
      }

      const results = await Promise.all(
        guesses.map((guess) => cachedSearch(normaliseQuery(guess), PER_GUESS_LIMIT, 0)),
      );

      const body: ShareIdentifyResponse = {
        source: {
          provider: ref.provider,
          videoId: ref.videoId,
          title: meta.title,
          author: meta.author,
        },
        guesses,
        items: mergeCandidates(results, limit),
      };

      // `no-store`: the body is derived from a link the user just shared, and
      // the cache that matters is the server-side one.
      c.header("Cache-Control", "private, no-store");
      return c.json(body);
    })
```

Two things this needs that do not exist yet:

1. `UNPROCESSABLE_SHARE` in the problem registry. Add it as `definition(422)`
   in `apps/api/src/problems.ts`, in status order after `TOO_MANY_REQUESTS`
   would be wrong — 422 sorts before 429:

```ts
  UNSUPPORTED_MEDIA_TYPE: definition(415),
  UNPROCESSABLE_SHARE: definition(422),
  TOO_MANY_REQUESTS: definition(429),
```

2. `deps.identifyModel`. Add `identifyModel: string;` to `AppDeps` in
   `apps/api/src/types.ts`. The model belongs in the cache key, and the route
   is where the key is built, so the route needs to know it. In
   `apps/api/test/helpers.ts` default it in `createTestApp`:

```ts
    identifyModel: "claude-haiku-4-5",
```

placed above `...overrides`.

- [ ] **Step 9: Wire production**

In `apps/api/src/index.ts`, add the import and two deps:

```ts
import { createShareProvider } from "./share/provider.js";
```

```ts
const app = createApp({
  db,
  cache,
  auth: clerkAuthProvider(env),
  share: createShareProvider(env),
  identifyModel: env.IDENTIFY_MODEL,
  production: env.NODE_ENV === "production",
});
```

- [ ] **Step 10: Run the whole API suite**

```bash
pnpm --filter api test
pnpm --filter api check-types
pnpm lint
```

Expected: PASS. The route test's 422 assertion for
`/watch?v=…/feed/subscriptions` proves the `UNPROCESSABLE_SHARE` path; the
`extractTitles` call-count assertions prove both cache behaviours.

- [ ] **Step 11: Commit**

```bash
pnpm format
git add apps/api
git commit -m "feat(api): POST /api/games/identify resolves a video link to games"
```

---

## Task 5: Mobile API layer

**Files:**

- Modify: `apps/mobile/src/api/client.ts`
- Modify: `apps/mobile/src/api/endpoints.ts`
- Modify: `apps/mobile/src/api/keys.ts`
- Modify: `apps/mobile/src/api/hooks.ts`
- Modify: `apps/mobile/test/api-endpoints.test.ts`
- Modify: `apps/mobile/test/api-keys.test.ts`

**Interfaces:**

- Consumes: `ShareIdentifyResponse`, `IDENTIFY_LIMIT_DEFAULT` (Task 1).
- Produces:
  - `endpoints.identifyShare(input: { url: string; limit?: number }): Promise<ShareIdentifyResponse>`
  - `keys.games.identify(url: string)`
  - `useIdentifyShare(url: string | null): UseQueryResult<ShareIdentifyResponse>`

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/test/api-endpoints.test.ts`, inside the
`describe("createEndpoints", …)` block:

```ts
it("posts a share link to identify, with a default limit", async () => {
  const { request, calls } = spy();
  await createEndpoints(request).identifyShare({
    url: "https://www.youtube.com/watch?v=1vs0lLIRt7w",
  });

  expect(calls[0]).toEqual({
    path: "/api/games/identify",
    options: {
      method: "POST",
      body: { url: "https://www.youtube.com/watch?v=1vs0lLIRt7w", limit: 15 },
    },
  });
});

it("passes an explicit identify limit through", async () => {
  const { request, calls } = spy();
  await createEndpoints(request).identifyShare({ url: "https://youtu.be/x", limit: 5 });

  expect(calls[0]?.options).toEqual({
    method: "POST",
    body: { url: "https://youtu.be/x", limit: 5 },
  });
});
```

Append to `apps/mobile/test/api-keys.test.ts`, inside `describe("query keys", …)`:

```ts
it("keys an identify by the shared url", () => {
  expect(keys.games.identify("https://youtu.be/x")).toEqual([
    "games",
    "identify",
    "https://youtu.be/x",
  ]);
});

it("distinguishes two different shared urls", () => {
  expect(keys.games.identify("https://youtu.be/a")).not.toEqual(
    keys.games.identify("https://youtu.be/b"),
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm --filter mobile test
```

Expected: FAIL — `identifyShare is not a function`, and
`keys.games.identify is not a function`.

- [ ] **Step 3: Implement**

In `apps/mobile/src/api/client.ts`, widen the method union — this is the app's
first POST:

```ts
export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}
```

In `apps/mobile/src/api/endpoints.ts`, add `IDENTIFY_LIMIT_DEFAULT` and
`ShareIdentifyResponse` to the `@repo/contracts` import, then add the endpoint
after `similarGames`:

```ts
    identifyShare: (input: { url: string; limit?: number }) =>
      request<ShareIdentifyResponse>("/api/games/identify", {
        method: "POST",
        body: { url: input.url, limit: input.limit ?? IDENTIFY_LIMIT_DEFAULT },
      }),
```

In `apps/mobile/src/api/keys.ts`, add to `games`:

```ts
    // Keyed by the shared url, not the video id: the app does not parse the
    // url, and the server's answer is per-url anyway.
    identify: (url: string) => ["games", "identify", url] as const,
```

In `apps/mobile/src/api/hooks.ts`, add `ShareIdentifyResponse` to the imports
and the hook after `useSimilarGames`:

```ts
export function useIdentifyShare(url: string | null): UseQueryResult<ShareIdentifyResponse> {
  const api = useApi();

  return useQuery({
    // `??` and `enabled` together: the key must be stable, and the query must
    // not run before a payload has resolved.
    queryKey: keys.games.identify(url ?? ""),
    // `enabled` gates the call, so the empty-string fallback is never sent.
    queryFn: () => api.identifyShare({ url: url ?? "" }),
    enabled: url !== null,
    // The server's answer for a given video is immutable for the life of its
    // cache, and the `identify` rate limit is 10/min, so a refetch on focus
    // would spend a request to learn nothing.
    staleTime: Infinity,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter mobile test
pnpm --filter mobile check-types
```

Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/mobile
git commit -m "feat(mobile): identify-share endpoint, query key and hook"
```

---

## Task 6: Share intake, the modal route, and the sheet

The only task that cannot be verified in CI. **Do Step 1 through Step 6 and get
the presentation working on hardware before building the sheet** — §11 of the
spec flags the transparent-modal nesting as the least certain part of the design.

**Files:**

- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/src/features/share/extract-url.ts`
- Create: `apps/mobile/test/extract-url.test.ts`
- Create: `apps/mobile/src/features/share/use-shared-url.ts`
- Create: `apps/mobile/src/features/share/share-sheet.tsx`
- Create: `apps/mobile/src/app/+native-intent.ts`
- Create: `apps/mobile/src/app/shared/_layout.tsx`
- Create: `apps/mobile/src/app/shared/index.tsx`
- Create: `apps/mobile/src/app/shared/game/[id].tsx`
- Modify: `apps/mobile/src/app/_layout.tsx`
- Modify: `README.md`
- Modify: `docs/mobile-device-verification.md`

**Interfaces:**

- Consumes: `useIdentifyShare` (Task 5), `GameRow`, `QueryBoundary`,
  `EmptyState`, `summarySubtitle`, `GameDetailScreen`.
- Produces:
  - `sharedUrlFrom(payloads: ResolvedPayloadLike[]): string | null`
  - `useSharedUrl(): { url: string | null; isResolving: boolean; clear: () => void }`
  - `ShareSheet({ url, onSelect, onDismiss })`

- [ ] **Step 1: Add the dependency and configure the plugin**

```bash
pnpm --filter mobile add expo-sharing
```

In `apps/mobile/app.json`, add to `plugins`, after `"expo-secure-store"`:

```json
      [
        "expo-sharing",
        {
          "ios": {
            "enabled": true,
            "activationRule": {
              "supportsWebUrlWithMaxCount": 1,
              "supportsWebPageWithMaxCount": 1,
              "supportsText": true
            }
          }
        }
      ],
```

All three rules, because the three sources differ: YouTube offers a bare URL,
Safari on a watch page offers a web page, and TikTok offers text containing a
URL. `extensionBundleIdentifier` and `appGroupId` are left unset — they default
to `gg.barklog.app.ShareExtension` and `group.gg.barklog.app`, which are what
we want.

- [ ] **Step 2: Regenerate the native project**

```bash
pnpm --filter mobile prebuild
```

Then, in the Apple Developer portal, before the next build:

- create an App ID for `gg.barklog.app.ShareExtension`
- create the App Group `group.gg.barklog.app`
- enable the App Group capability on **both** `gg.barklog.app` and the
  extension App ID

- [ ] **Step 3: Route the incoming intent**

Create `apps/mobile/src/app/+native-intent.ts`:

```ts
/**
 * `redirectSystemPath` returns a path to navigate to — there is no return
 * value meaning "stay where you are". So a share has to land on a route, which
 * is why `/shared` exists and why the root layout is a Stack (see
 * `_layout.tsx`).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return new URL(path).hostname === "expo-sharing" ? "/shared" : path;
  } catch {
    // Not a URL at all: hand expo-router the path untouched rather than
    // swallowing a deep link this function does not own.
    return path;
  }
}
```

- [ ] **Step 4: Turn the root layout into a Stack**

In `apps/mobile/src/app/_layout.tsx`, replace the `Slot` import with `Stack`
and replace the `<Slot />` element and its comment:

```tsx
<AuthGate>
  {/* `Stack`, not `Slot`: `/shared` is a sibling of `(tabs)` and
                    must present *over* the tab controller. Under `Slot` it
                    would replace it — the tabs would unmount, their stacks
                    would be lost, and a dismiss would have nowhere to return
                    to. The extra UINavigationController this costs is hidden
                    by `headerShown: false`. */}
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="shared" options={{ presentation: "transparentModal" }} />
  </Stack>
</AuthGate>
```

- [ ] **Step 5: Add the modal route group, with the sheet stubbed**

Create `apps/mobile/src/app/shared/_layout.tsx`:

```tsx
import { Stack } from "expo-router";
import { PlatformColor } from "react-native";

export default function SharedLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Transparent, so the sheet floats over the tabs the user came from. */}
      <Stack.Screen name="index" options={{ contentStyle: { backgroundColor: "transparent" } }} />
      {/* Opaque, or the detail screen inherits the group's transparency. */}
      <Stack.Screen
        name="game/[id]"
        options={{
          headerShown: true,
          contentStyle: { backgroundColor: PlatformColor("systemBackground") },
        }}
      />
    </Stack>
  );
}
```

Create `apps/mobile/src/app/shared/index.tsx` with a placeholder body, purely
to prove the presentation:

```tsx
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function SharedIndex() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, justifyContent: "flex-end" }}>
      <Pressable onPress={() => router.back()} style={{ padding: 40, backgroundColor: "white" }}>
        <Text>presentation check — tap to dismiss</Text>
      </Pressable>
    </View>
  );
}
```

Create `apps/mobile/src/app/shared/game/[id].tsx`:

```tsx
import { useRouter } from "expo-router";
import { useCallback } from "react";

import { GameDetailScreen } from "@/features/game/game-detail-screen";

export default function SharedGameDetail() {
  const router = useRouter();
  const openGame = useCallback((id: number) => router.push(`/shared/game/${id}`), [router]);

  return <GameDetailScreen onOpenGame={openGame} />;
}
```

- [ ] **Step 6: Verify the presentation on a device — the gate for the rest of this task**

```bash
pnpm --filter mobile ios:device
```

Then check, by hand:

- The tabs are still visible behind `/shared` when it is open. Reach it with
  `npx uri-scheme open "barklog://shared" --ios` if the extension is not yet
  provisioned.
- Tapping the placeholder dismisses back to **the tab you started on**, with
  its navigation stack intact.
- Pushing `/shared/game/1942` from the placeholder shows an opaque detail
  screen, not a transparent one.

**If the transparent-modal nesting does not behave, stop and report it rather
than working around it.** The spec's §11 alternative — a plain full-screen
`/shared` route instead of a sheet — is a design decision, not an
implementation detail.

- [ ] **Step 7: Commit the presentation**

```bash
pnpm format
git add apps/mobile
git commit -m "feat(mobile): receive share intents into a /shared modal route"
```

- [ ] **Step 8: Write the failing URL-extraction test**

Create `apps/mobile/test/extract-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { sharedUrlFrom } from "@/features/share/extract-url";

describe("sharedUrlFrom", () => {
  it("reads a website payload's contentUri, which is how YouTube shares", () => {
    expect(
      sharedUrlFrom([
        { contentType: "website", contentUri: "https://www.youtube.com/watch?v=1vs0lLIRt7w" },
      ]),
    ).toBe("https://www.youtube.com/watch?v=1vs0lLIRt7w");
  });

  it("pulls the url out of a text payload, which is how TikTok shares", () => {
    expect(
      sharedUrlFrom([
        {
          contentType: "text",
          value: "Check this out https://vm.tiktok.com/ZMabcdef/ so good #residentevil",
        },
      ]),
    ).toBe("https://vm.tiktok.com/ZMabcdef/");
  });

  it("takes the first payload that yields a url", () => {
    expect(
      sharedUrlFrom([
        { contentType: "text", value: "no link here" },
        { contentType: "website", contentUri: "https://youtu.be/1vs0lLIRt7w" },
      ]),
    ).toBe("https://youtu.be/1vs0lLIRt7w");
  });

  it("strips trailing punctuation a sentence leaves on the url", () => {
    expect(
      sharedUrlFrom([{ contentType: "text", value: "watch (https://youtu.be/abcdefghijk)." }]),
    ).toBe("https://youtu.be/abcdefghijk");
  });

  it("is null for no payloads, an empty payload, or a payload with no url", () => {
    expect(sharedUrlFrom([])).toBeNull();
    expect(sharedUrlFrom([{ contentType: "text", value: "" }])).toBeNull();
    expect(sharedUrlFrom([{ contentType: "image", contentUri: "file:///tmp/a.png" }])).toBeNull();
  });
});
```

- [ ] **Step 9: Run it to verify it fails**

```bash
pnpm --filter mobile test extract-url
```

Expected: FAIL — `Cannot find module '@/features/share/extract-url'`.

- [ ] **Step 10: Implement it**

Create `apps/mobile/src/features/share/extract-url.ts`:

```ts
/**
 * Pure, and with no react-native in its module graph, so it tests in plain
 * Node — the same reason `features/onboarding/pages.ts` is structured this way.
 *
 * Structurally typed rather than importing expo-sharing's `ResolvedSharePayload`:
 * that would pull a native module into the test's graph for one field.
 */
export interface ResolvedPayloadLike {
  contentType?: string | null;
  contentUri?: string | null;
  value?: string | null;
}

const URL_IN_TEXT = /https:\/\/[^\s<>"']+/;

/** A url at the end of a sentence collects punctuation that is not part of it. */
const TRAILING = /[.,;:!?)\]}>'"]+$/;

function firstUrl(text: string): string | null {
  const match = URL_IN_TEXT.exec(text);
  if (match === null) return null;

  const trimmed = match[0].replace(TRAILING, "");

  return trimmed === "" ? null : trimmed;
}

/**
 * The three iOS activation rules produce two payload shapes: a `website`
 * carrying the link in `contentUri`, and a `text` carrying it inside `value`.
 * Everything else is ignored — the API validates the host anyway, so this only
 * has to find a candidate.
 */
export function sharedUrlFrom(payloads: readonly ResolvedPayloadLike[]): string | null {
  for (const payload of payloads) {
    if (payload.contentType === "website" && payload.contentUri) {
      const url = firstUrl(payload.contentUri);
      if (url !== null) return url;
    }

    if (payload.value) {
      const url = firstUrl(payload.value);
      if (url !== null) return url;
    }
  }

  return null;
}
```

- [ ] **Step 11: Run it to verify it passes**

```bash
pnpm --filter mobile test extract-url
```

Expected: PASS, 5 tests.

- [ ] **Step 12: Wrap the hook**

Create `apps/mobile/src/features/share/use-shared-url.ts`:

```ts
import { useIncomingShare } from "expo-sharing";
import { useMemo } from "react";

import { sharedUrlFrom } from "./extract-url";

export function useSharedUrl(): {
  url: string | null;
  isResolving: boolean;
  clear: () => void;
} {
  const { resolvedSharedPayloads, isResolving, clearSharedPayloads } = useIncomingShare();

  const url = useMemo(() => sharedUrlFrom(resolvedSharedPayloads), [resolvedSharedPayloads]);

  return { url, isResolving, clear: clearSharedPayloads };
}
```

- [ ] **Step 13: Build the sheet**

Create `apps/mobile/src/features/share/share-sheet.tsx`:

```tsx
import { BottomSheet } from "@expo/ui";
import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { FlatList, PlatformColor, StyleSheet, Text, View } from "react-native";

import { useIdentifyShare } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameRow } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { summarySubtitle } from "@/features/game/format";
import { Type } from "@/theme";

const keyExtractor = (item: GameSummaryWire) => String(item.id);

/** Reads as a sentence when the guesses are joined, not as a debug dump. */
function guessLine(guesses: string[]): string {
  if (guesses.length === 0) return "We could not tell which game this video is about.";

  return `We think this is about ${guesses.join(" or ")}, but it is not in the catalogue yet.`;
}

export function ShareSheet({
  url,
  isPresented,
  onSelect,
  onDismiss,
  onSearch,
}: {
  url: string | null;
  isPresented: boolean;
  onSelect: (id: number) => void;
  onDismiss: () => void;
  onSearch: () => void;
}) {
  const identify = useIdentifyShare(url);

  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire }) => (
      <GameRow
        id={item.id}
        title={item.name}
        subtitle={summarySubtitle(item)}
        coverImageId={item.coverImageId}
        onPress={onSelect}
      />
    ),
    [onSelect],
  );

  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={onDismiss}
      snapPoints={["half", "full"]}
      contentPadding={0}
    >
      <View style={styles.sheet}>
        <QueryBoundary query={identify}>
          {(data) => (
            <>
              <View style={styles.header}>
                <Text style={styles.title}>Barklog fetched these</Text>
                <Text style={styles.source} numberOfLines={2}>
                  {data.source.title}
                </Text>
              </View>

              {data.items.length === 0 ? (
                <EmptyState
                  title="No match in the catalogue"
                  systemImage="magnifyingglass"
                  description={guessLine(data.guesses)}
                  action={{ label: "Search Instead", onPress: onSearch }}
                />
              ) : (
                <FlatList
                  data={data.items}
                  keyExtractor={keyExtractor}
                  renderItem={renderItem}
                  contentInsetAdjustmentBehavior="automatic"
                />
              )}
            </>
          )}
        </QueryBoundary>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 4 },
  title: { ...Type.title2, color: PlatformColor("label") },
  source: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
});
```

- [ ] **Step 14: Replace the placeholder route with the sheet**

Replace `apps/mobile/src/app/shared/index.tsx` entirely:

```tsx
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback } from "react";

import { ShareSheet } from "@/features/share/share-sheet";
import { useSharedUrl } from "@/features/share/use-shared-url";

export default function SharedIndex() {
  const router = useRouter();
  const { url, clear } = useSharedUrl();

  /**
   * Focus, not local state: pushing the detail screen collapses the sheet, and
   * coming back re-presents it. "Wrong pick, go back" then needs no state of
   * its own.
   */
  const isFocused = useIsFocused();

  const dismiss = useCallback(() => {
    // Before `back()`: without this the payload survives in the App Group and
    // the next cold launch re-presents a share the user already dealt with.
    clear();
    router.back();
  }, [clear, router]);

  const openGame = useCallback((id: number) => router.push(`/shared/game/${id}`), [router]);

  const search = useCallback(() => {
    clear();
    // `dismissTo`, not `replace`: the sheet lives inside a modal stack, and
    // `replace` would swap the modal's own screen rather than closing it.
    router.dismissTo("/search");
  }, [clear, router]);

  return (
    <ShareSheet
      url={url}
      isPresented={isFocused}
      onSelect={openGame}
      onDismiss={dismiss}
      onSearch={search}
    />
  );
}
```

Two escape hatches, since both APIs are the kind that shift between SDKs:

- `@react-navigation/native` is already in the tree as an expo-router
  dependency, so `useIsFocused` needs no new package. If `check-types` cannot
  resolve it, use expo-router's `useFocusEffect` with a local boolean instead —
  do **not** add the package to `apps/mobile/package.json`.
- If `router.dismissTo` is not on the router type, use `router.back()` and drop
  the Search affordance to a follow-up rather than chaining two navigation
  calls in one handler — that races, and the failure looks like a stuck modal.

- [ ] **Step 15: Verify types, lint and the unit suite**

```bash
pnpm --filter mobile check-types
pnpm --filter mobile lint
pnpm --filter mobile test
```

Expected: PASS on all three.

- [ ] **Step 16: Update the docs**

In `README.md`:

- add `POST /api/games/identify` to the `apps/api` route table, noted as
  "`{url}`; YouTube or TikTok, returns ranked candidates"
- add `share/` to the `apps/api` source tree listing and `features/share/` plus
  the `shared/` route group to the `apps/mobile` one
- rewrite the **Tabs** paragraph's `Slot` claim: the root is now a `Stack` so
  `/shared` can present over the tab controller
- add a short **Sharing a video** section describing the journey, the
  `expo-sharing` plugin block, and the two Apple Developer prerequisites
- next to the `platforms: ["ios"]` note, record that Expo marks iOS
  share-receiving experimental — the extension opens the main target rather
  than processing in a `ViewController`

In `docs/mobile-device-verification.md`, add a **Share intent** section with
exactly these checks:

- Barklog appears in the share sheet from the YouTube app, the TikTok app, and
  Safari on a watch page
- Warm launch presents the sheet; cold launch presents the sheet
- Signed-out cold install: `AuthView` first, sheet after sign-in
- Dismissing clears the payload — relaunching does **not** re-present it
- Pick a candidate, go back: the sheet re-presents
- A private or deleted video shows the 404 copy, not a crash
- A TikTok short link (`vm.tiktok.com`) resolves
- Dismissing returns to the originating tab with its stack intact

- [ ] **Step 17: Commit**

```bash
pnpm format
git add apps/mobile README.md docs/mobile-device-verification.md pnpm-lock.yaml
git commit -m "feat(mobile): present shared-video candidates in a bottom sheet"
```

---

## Task 7: The onboarding step

**Files:**

- Modify: `apps/mobile/src/features/onboarding/pages.ts`
- Modify: `apps/mobile/test/onboarding-pages.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: a fifth entry in `ONBOARDING_PAGES` with `id: "share"` at index 3.

- [ ] **Step 1: Update the failing tests**

In `apps/mobile/test/onboarding-pages.test.ts`, four assertions move. Change
the first test's name and expectation:

```ts
it("is the five pages, in the agreed order", () => {
  expect(ONBOARDING_PAGES.map((page) => page.title)).toEqual([
    "Welcome to Barklog",
    "Managing your game backlog",
    "Exploring games",
    "Share a video, fetch the game",
    "All game data is powered by IGDB",
  ]);
});
```

In `describe("pageIndex", …)`, the last page moved from 3 to 4:

```ts
it("finds the last page", () => {
  expect(pageIndex(IGDB_PAGE_ID)).toBe(4);
});
```

In `describe("nextPageId", …)`, add one test and keep the rest as they are:

```ts
it("puts the share page between explore and the attribution", () => {
  expect(nextPageId("explore")).toBe("share");
  expect(nextPageId("share")).toBe(IGDB_PAGE_ID);
});
```

And add one test to the `ONBOARDING_PAGES` describe, so the page cannot silently
drift away from naming both platforms:

```ts
it("names both launch platforms on the share page", () => {
  const page = ONBOARDING_PAGES.find((candidate) => candidate.id === "share");

  expect(page?.description).toContain("YouTube");
  expect(page?.description).toContain("TikTok");
});
```

- [ ] **Step 2: Run them to verify they fail**

```bash
pnpm --filter mobile test onboarding-pages
```

Expected: FAIL — four pages where five are expected, and
`pageIndex(IGDB_PAGE_ID)` is 3.

- [ ] **Step 3: Add the page**

In `apps/mobile/src/features/onboarding/pages.ts`, insert between the
`explore` and `IGDB_PAGE_ID` entries:

```ts
  {
    id: "share",
    systemImage: "square.and.arrow.up",
    title: "Share a video, fetch the game",
    description:
      "Watching a game video on YouTube or TikTok? Share it to Barklog and the dog fetches the game for your backlog.",
  },
```

Nothing else changes: `onboarding-screen.tsx` maps over the tuple and derives
`isLast` from `nextPageId`, and `as const satisfies` keeps the tuple length
literal, so `pageIndex` and `nextPageId` need no edit. The IGDB page stays last
because attribution reads as the closer.

- [ ] **Step 4: Run them to verify they pass**

```bash
pnpm --filter mobile test onboarding-pages
pnpm --filter mobile check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm format
git add apps/mobile
git commit -m "feat(mobile): onboarding page for sharing a video"
```

---

## Final verification

- [ ] **Run everything**

```bash
pnpm lint
pnpm check-types
pnpm test
pnpm format:check
```

All four must pass. `pnpm test` starts its own Postgres and Valkey through
Testcontainers, so a Docker daemon has to be running, and it must still need no
network access.

- [ ] **Confirm the device checklist**

Walk `docs/mobile-device-verification.md`'s new **Share intent** section on a
real device. Task 6's Step 16 list is the checklist; nothing in it is optional,
and the cold-launch and dismiss-clears-payload lines are the two most likely to
fail.
