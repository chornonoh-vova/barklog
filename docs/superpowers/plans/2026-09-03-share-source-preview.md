# Share Source Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the share screen a source preview — cover art, video title, author — plus a bordered orange warning when the game could not be identified, a large title, and a right-placed close button.

**Architecture:** One additive wire field (`ShareSourceWire.thumbnailUrl`) carries the cover url that the API's oEmbed call already receives and currently discards. The mobile side renders it at a provider-derived aspect (16:9 YouTube, 9:16 TikTok) and a fixed 56pt height, in a new `ShareHeader` component that becomes the `ListHeaderComponent` of a single `FlatList` serving both the results and the no-match empty state.

**Tech Stack:** TypeScript, valibot (API schemas), Hono (API), Expo SDK 57 / expo-router / expo-image / expo-symbols (mobile), vitest (both), Valkey via `@repo/cache`, testcontainers (API suite).

**Spec:** `docs/superpowers/specs/2026-09-03-share-source-preview-design.md`

## Global Constraints

- **Read the versioned Expo docs before editing any mobile file.** `apps/mobile/AGENTS.md` requires https://docs.expo.dev/versions/v57.0.0/ — Expo has changed. The relevant page is `sdk/router/stack`.
- **No new hex colour literals.** `apps/mobile/src/theme.ts` states `Brand.tint` (`#208AEF`) is the only hex literal in the app; everything else is `PlatformColor`. The warning banner must obey this.
- **`@repo/contracts` resolves to `./dist`.** After editing `packages/contracts/src/*`, run `pnpm --filter @repo/contracts build` before any API or mobile type-check or test, or the change is invisible.
- **The API suite needs Docker running.** `apps/api/vitest.config.ts` uses `globalSetup: ["./test/setup/containers.ts"]`.
- **Mobile tests are pure-Node only.** All 25 files in `apps/mobile/test/` avoid react-native in their module graph. No render harness exists; do not add one in this plan.
- **Copy is fixed.** `TITLE_MATCH_NOTICE` in `apps/mobile/src/features/share/empty-states.ts` is unchanged — `apps/mobile/test/share-empty-states.test.ts` asserts on it.
- **`SymbolView` does accept `style` and accessibility props.** `expo-symbols`' `SymbolViewProps` is `{ ... } & ViewProps` (`node_modules/expo-symbols/build/SymbolModule.types.d.ts:62`), so it inherits both from `ViewProps`. It is still wrapped in a `View` here because `accessibilityElementsHidden` hides the elements *contained within* a view, not the view itself — the correct way to silence a leaf glyph for VoiceOver.
- **Fixed dimensions:** source thumbnail height is `56` for both providers; YouTube renders `100 x 56`, TikTok `32 x 56`.
- **Branch:** `feat/share-source-preview`, already created, with the spec committed at `e45093c`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `packages/contracts/src/share.ts` | `ShareSourceWire.thumbnailUrl` — the wire field |
| `apps/api/src/share/oembed.ts` | Read `thumbnail_url` leniently, narrow it to an https url or `null` |
| `apps/api/src/cache-keys.ts` | `oembedKey` gains a `v2` generation, because the cached `VideoMeta` shape changed |
| `apps/api/src/routes/games.ts` | Put `thumbnailUrl` on the response body |
| `apps/mobile/src/features/share/source-thumb.ts` | Pure: provider display aspect and cover dimensions |
| `apps/mobile/src/features/share/share-header.tsx` | The whole `ListHeaderComponent`: question, source row, warning |
| `apps/mobile/src/features/share/share-screen.tsx` | One `FlatList` with both a header and an empty component |
| `apps/mobile/src/app/shared/index.tsx` | Large title, right-placed close button |
| `docs/mobile-device-verification.md` | Rewrite check 38; add checks 44 onward |

Tasks 1 and 2 are ordered by dependency: the mobile side cannot type-check against `thumbnailUrl` until the contract is built.

---

### Task 1: `thumbnailUrl` end to end on the server

The contract field, the oEmbed read, the cache generation and the route body land together. They cannot be split: `VideoMeta.thumbnailUrl` is required, so the moment it exists, `const META: VideoMeta` in `apps/api/test/identify-routes.test.ts:12` is a type error and the route's `body.source` assertion is short a key. One task, one green suite.

**Files:**
- Modify: `packages/contracts/src/share.ts:63-68` (`ShareSourceWire`)
- Modify: `apps/api/src/share/oembed.ts:6-9` (`VideoMeta`), `:36-41` (`oembedSchema`), `:68-71` (return)
- Modify: `apps/api/src/cache-keys.ts:39-41` (`oembedKey`)
- Modify: `apps/api/src/routes/games.ts:230-235` (the `source` object)
- Test: `apps/api/test/share-oembed.test.ts`, `apps/api/test/identify-routes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ShareSourceWire.thumbnailUrl: string | null` (exported from `@repo/contracts`)
  - `VideoMeta.thumbnailUrl: string | null` (from `apps/api/src/share/oembed.js`)
  - `oembedKey(provider, videoId)` now returns `oembed:v2:${provider}:${videoId}`

- [ ] **Step 1: Update the three existing oEmbed assertions to expect the new field**

In `apps/api/test/share-oembed.test.ts`, the first three tests use `toEqual` on the whole `VideoMeta`, so each needs the new key. Replace the first test wholesale:

```ts
it("asks YouTube's endpoint about the page URL and returns title, author and thumbnail", async () => {
  const fetchImpl = vi.fn(async () =>
    json({
      title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
      author_name: "Snamwiches",
      thumbnail_url: "https://i.ytimg.com/vi/1vs0lLIRt7w/hqdefault.jpg",
    }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(YOUTUBE, fetchImpl)).toEqual({
    title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
    author: "Snamwiches",
    thumbnailUrl: "https://i.ytimg.com/vi/1vs0lLIRt7w/hqdefault.jpg",
  });

  const [calledUrl] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
  expect(String(calledUrl)).toBe(
    "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D1vs0lLIRt7w&format=json",
  );
});
```

Then add `thumbnailUrl: null` to the expected object in the next two tests — `"asks TikTok's endpoint, and tolerates a missing author"` and `"tolerates a null author_name, not just a missing one"`. Neither payload carries a `thumbnail_url`, so `null` is the correct expectation and these two double as the absent-thumbnail cases.

- [ ] **Step 2: Add the three lenient-parse tests**

Append to `apps/api/test/share-oembed.test.ts`. Each one asserts the surrounding parse still *succeeds* — that is the whole point: a bad thumbnail must never turn a working identification into a 502.

```ts
it("drops a non-string thumbnail_url instead of failing the parse", async () => {
  const fetchImpl = vi.fn(async () =>
    json({ title: "beating this boss #residentevil", thumbnail_url: { url: "nope" } }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(TIKTOK, fetchImpl)).toEqual({
    title: "beating this boss #residentevil",
    author: null,
    thumbnailUrl: null,
  });
});

it("drops an unparseable thumbnail_url instead of failing the parse", async () => {
  const fetchImpl = vi.fn(async () =>
    json({ title: "beating this boss #residentevil", thumbnail_url: "not a url" }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(TIKTOK, fetchImpl)).toEqual({
    title: "beating this boss #residentevil",
    author: null,
    thumbnailUrl: null,
  });
});

it("drops a non-https thumbnail_url, which is handed to the client to load", async () => {
  const fetchImpl = vi.fn(async () =>
    json({
      title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
      author_name: "Snamwiches",
      thumbnail_url: "http://i.ytimg.com/vi/1vs0lLIRt7w/hqdefault.jpg",
    }),
  ) as unknown as typeof fetch;

  expect(await fetchVideoMeta(YOUTUBE, fetchImpl)).toEqual({
    title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
    author: "Snamwiches",
    thumbnailUrl: null,
  });
});
```

- [ ] **Step 3: Run the oEmbed tests to verify they fail**

```bash
pnpm --filter api test share-oembed
```

Expected: FAIL. The six thumbnail assertions all report a missing `thumbnailUrl` key, because `fetchVideoMeta` does not return one yet.

- [ ] **Step 4: Implement the oEmbed read**

In `apps/api/src/share/oembed.ts`, add the field to `VideoMeta`:

```ts
export interface VideoMeta {
  title: string;
  author: string | null;
  /** oEmbed's cover image, or `null` when it gave nothing usable. */
  thumbnailUrl: string | null;
}
```

Add the schema entry, keeping the existing two exactly as they are:

```ts
const oembedSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1)),
  // `nullish`, not `optional`: a `null` author_name in an otherwise valid
  // 200 must not fail the whole schema and turn into a 502.
  author_name: v.nullish(v.pipe(v.string(), v.trim())),
  // `unknown`, narrowed by `httpsUrlOrNull` below rather than validated
  // here, for the same reason: a malformed thumbnail is not worth a 502.
  thumbnail_url: v.optional(v.unknown()),
});
```

Add the helper below the schema:

```ts
/**
 * Handed straight to the client to load, so anything that is not an https
 * url is dropped rather than forwarded.
 */
function httpsUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
```

And extend the return at the end of `fetchVideoMeta`:

```ts
  return {
    title: parsed.output.title,
    author: parsed.output.author_name || null,
    thumbnailUrl: httpsUrlOrNull(parsed.output.thumbnail_url),
  };
```

- [ ] **Step 5: Run the oEmbed tests to verify they pass**

```bash
pnpm --filter api test share-oembed
```

Expected: PASS, all cases.

- [ ] **Step 6: Add the field to the contract and rebuild it**

In `packages/contracts/src/share.ts`, extend `ShareSourceWire`:

```ts
export interface ShareSourceWire {
  provider: ShareProviderName;
  videoId: string;
  title: string;
  author: string | null;
  /**
   * oEmbed's cover image. `null` when the provider omitted one or gave
   * something that is not an https url. TikTok's is a signed CDN url that can
   * expire inside `OEMBED_TTL_SECONDS`, so a load failure on the client is
   * ordinary, not exceptional.
   */
  thumbnailUrl: string | null;
}
```

Then rebuild, or the API and mobile still see the old declaration:

```bash
pnpm --filter @repo/contracts build
```

- [ ] **Step 7: Write the failing route tests**

In `apps/api/test/identify-routes.test.ts`, give `META` the new field (a type error until this step, since `VideoMeta` now requires it):

```ts
const META: VideoMeta = {
  title: "Can You Beat Resident Evil 2 WITHOUT Killing Anything?",
  author: "Snamwiches",
  thumbnailUrl: "https://i.ytimg.com/vi/1vs0lLIRt7w/hqdefault.jpg",
};
```

In the first test, widen the body type and the assertion:

```ts
  const body = (await response.json()) as {
    source: {
      provider: string;
      videoId: string;
      title: string;
      author: string | null;
      thumbnailUrl: string | null;
    };
    identified: boolean;
    guesses: string[];
    items: { id: number }[];
  };
```

```ts
  expect(body.source).toEqual({
    provider: "youtube",
    videoId: "1vs0lLIRt7w",
    title: META.title,
    author: "Snamwiches",
    thumbnailUrl: META.thumbnailUrl,
  });
```

Then append two new tests. The second pins the `?? null` guard: `withCache` does no validation (`packages/cache/src/with-cache.ts:14` is an unchecked `cache.get<T>` cast), so a cache entry of the previous shape must still produce a `null` rather than a missing key.

```ts
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

test("a cached VideoMeta with no thumbnailUrl answers null, not a missing key", async () => {
  await seedGame(harness.db, { id: 1, name: "Resident Evil 2", count: 2000 });

  // Written by hand in the pre-`thumbnailUrl` shape, under the current
  // generation's key, because `withCache` casts rather than validates.
  await harness.cache.set(
    "oembed:v2:youtube:1vs0lLIRt7w",
    { title: META.title, author: META.author },
    60,
  );

  const response = await identify({ url: RE2_URL });
  const body = (await response.json()) as { source: Record<string, unknown> };

  expect(response.status).toBe(200);
  expect(body.source).toHaveProperty("thumbnailUrl", null);
});
```

- [ ] **Step 8: Run the route tests to verify they fail**

```bash
pnpm --filter api test identify-routes
```

Expected: FAIL. The first test reports `thumbnailUrl` missing from `body.source`; both new tests fail the same way.

- [ ] **Step 9: Bump the oEmbed cache generation**

In `apps/api/src/cache-keys.ts`, replace `oembedKey`:

```ts
export function oembedKey(provider: ShareProviderName, videoId: string): string {
  // `v2`: the cached value is a `VideoMeta`, and it gained `thumbnailUrl`.
  // Entries from the previous generation deserialise without it, and
  // `withCache` casts rather than validates.
  return `oembed:v2:${provider}:${videoId}`;
}
```

`OEMBED_TTL_SECONDS` is unchanged — its comment is about the title, which still effectively never changes, and the added url's expiry is handled on the client.

- [ ] **Step 10: Put the field on the response body**

In `apps/api/src/routes/games.ts`, in the `ShareIdentifyResponse` body:

```ts
      const body: ShareIdentifyResponse = {
        source: {
          provider: ref.provider,
          videoId: ref.videoId,
          title: meta.title,
          author: meta.author,
          // `?? null`: `withCache` casts rather than validates, so a cache
          // entry written before this field existed arrives without it.
          thumbnailUrl: meta.thumbnailUrl ?? null,
        },
        identified,
        guesses,
        items: mergeCandidates(results, limit),
      };
```

- [ ] **Step 11: Run the whole API suite and the type-check**

```bash
pnpm --filter api test && pnpm --filter api check-types && pnpm --filter api lint
```

Expected: PASS on all three. If `check-types` complains about `@repo/contracts`, Step 6's build was skipped.

- [ ] **Step 12: Commit**

```bash
git add packages/contracts/src/share.ts apps/api/src/share/oembed.ts \
  apps/api/src/cache-keys.ts apps/api/src/routes/games.ts \
  apps/api/test/share-oembed.test.ts apps/api/test/identify-routes.test.ts
git commit -m "feat(api): carry the video thumbnail url through identify"
```

---

### Task 2: The mobile cover dimensions

A pure module, so it tests in plain Node — the same structure and the same stated reason as `features/share/extract-url.ts` and `features/share/empty-states.ts`.

**Files:**
- Create: `apps/mobile/src/features/share/source-thumb.ts`
- Test: `apps/mobile/test/source-thumb.test.ts`

**Interfaces:**
- Consumes: `ShareProviderName` from `@repo/contracts` (type-only, so nothing is pulled in at runtime).
- Produces: `sourceThumbSize(provider: ShareProviderName): { width: number; height: number }` — `{ width: 100, height: 56 }` for `"youtube"`, `{ width: 32, height: 56 }` for `"tiktok"`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/test/source-thumb.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { sourceThumbSize } from "@/features/share/source-thumb";

describe("sourceThumbSize", () => {
  it("gives both providers the same height, so the row never changes height", () => {
    expect(sourceThumbSize("youtube").height).toBe(sourceThumbSize("tiktok").height);
  });

  it("renders YouTube landscape", () => {
    const { width, height } = sourceThumbSize("youtube");

    expect(width).toBeGreaterThan(height);
  });

  it("renders TikTok portrait", () => {
    const { width, height } = sourceThumbSize("tiktok");

    expect(height).toBeGreaterThan(width);
  });

  it("pins the exact dimensions, so a change in the rounding is visible", () => {
    expect(sourceThumbSize("youtube")).toEqual({ width: 100, height: 56 });
    expect(sourceThumbSize("tiktok")).toEqual({ width: 32, height: 56 });
  });

  it("returns whole points, so the image never lands on a half-pixel edge", () => {
    for (const provider of ["youtube", "tiktok"] as const) {
      const { width, height } = sourceThumbSize(provider);

      expect(Number.isInteger(width)).toBe(true);
      expect(Number.isInteger(height)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter mobile test source-thumb
```

Expected: FAIL — cannot resolve `@/features/share/source-thumb`.

- [ ] **Step 3: Write the implementation**

Create `apps/mobile/src/features/share/source-thumb.ts`:

```ts
import type { ShareProviderName } from "@repo/contracts";

/**
 * Pure, and with no react-native in its module graph, so it tests in plain
 * Node — the same reason `features/share/extract-url.ts` is structured this
 * way. The `@repo/contracts` import is type-only and erases.
 */

/** Equal across providers, so the row's height never depends on the source. */
const SOURCE_THUMB_HEIGHT = 56;

/**
 * The aspect we render at, which is deliberately not the aspect oEmbed
 * reports. YouTube's thumbnail is `hqdefault.jpg` at 480x360 — 4:3, with
 * letterbox bars baked in — so a 16:9 box with `contentFit="cover"` crops off
 * exactly the bars. TikTok's cover is already portrait, so 9:16 crops
 * nothing. A rare landscape TikTok is centre-cropped, which is the accepted
 * cost of not plumbing the reported dimensions.
 */
const ASPECT: Record<ShareProviderName, number> = {
  youtube: 16 / 9,
  tiktok: 9 / 16,
};

export function sourceThumbSize(provider: ShareProviderName): {
  width: number;
  height: number;
} {
  return {
    width: Math.round(SOURCE_THUMB_HEIGHT * ASPECT[provider]),
    height: SOURCE_THUMB_HEIGHT,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter mobile test source-thumb
```

Expected: PASS, five cases.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/share/source-thumb.ts apps/mobile/test/source-thumb.test.ts
git commit -m "feat(mobile): provider-aware source thumbnail dimensions"
```

---

### Task 3: The header component and the single-list screen

The new component and the screen that consumes it land together: a reviewer judges them as one change, and the component has no observable behaviour until the screen renders it.

Read https://docs.expo.dev/versions/v57.0.0/sdk/router/stack before starting, per the global constraints.

**Files:**
- Create: `apps/mobile/src/features/share/share-header.tsx`
- Modify: `apps/mobile/src/features/share/share-screen.tsx` (the `QueryBoundary` body, `:69-90`, and the `styles` block, `:93-98`)

**Interfaces:**
- Consumes: `sourceThumbSize` from Task 2; `ShareSourceWire` from `@repo/contracts` (Task 1); `TITLE_MATCH_NOTICE` and `noMatch` from `features/share/empty-states`.
- Produces: `ShareHeader({ source, identified }: { source: ShareSourceWire; identified: boolean })`.

- [ ] **Step 1: Create the header component**

Create `apps/mobile/src/features/share/share-header.tsx`:

```tsx
import type { ShareSourceWire } from "@repo/contracts";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { TITLE_MATCH_NOTICE } from "@/features/share/empty-states";
import { sourceThumbSize } from "@/features/share/source-thumb";
import { Type } from "@/theme";

/**
 * The share screen's whole `ListHeaderComponent`, and the owner of its
 * padding, so the list stays responsible only for the list.
 */
export function ShareHeader({
  source,
  identified,
}: {
  source: ShareSourceWire;
  identified: boolean;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.question}>Which game is this?</Text>

      <View style={styles.source}>
        <SourceCover source={source} />

        <View style={styles.sourceText}>
          <Text style={styles.sourceTitle} numberOfLines={2}>
            {source.title}
          </Text>
          {source.author === null ? null : (
            <Text style={styles.sourceAuthor} numberOfLines={1}>
              {source.author}
            </Text>
          )}
        </View>
      </View>

      {identified ? null : <FallbackNotice />}
    </View>
  );
}

/**
 * The cover, with the placeholder covering two cases rather than one: a
 * provider that gave no thumbnail, and a url that has since expired. TikTok's
 * is a signed CDN url with a lifetime shorter than `OEMBED_TTL_SECONDS`, so
 * `onError` is an ordinary outcome here, not an exceptional one.
 *
 * Both branches render at the same dimensions, so the row never shifts.
 */
function SourceCover({ source }: { source: ShareSourceWire }) {
  const [failed, setFailed] = useState(false);
  const size = sourceThumbSize(source.provider);

  // The title beside it says everything the cover says, so VoiceOver skips it.
  if (source.thumbnailUrl === null || failed) {
    return (
      <View style={[styles.cover, styles.coverPlaceholder, size]} accessibilityElementsHidden>
        <SymbolView
          name="play.rectangle.fill"
          size={Math.min(size.width, size.height) * 0.5}
          tintColor={PlatformColor("secondaryLabel")}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: source.thumbnailUrl }}
      style={[styles.cover, size]}
      contentFit="cover"
      transition={150}
      cachePolicy="disk"
      onError={() => setFailed(true)}
      accessibilityElementsHidden
    />
  );
}

/**
 * `opacity` sits on a child rather than the container because React Native
 * will not apply alpha to a `PlatformColor`, and `theme.ts` keeps
 * `Brand.tint` as the app's only hex literal. Border, glyph and fill are then
 * all the same dynamic colour, so all three track light and dark for free.
 */
function FallbackNotice() {
  return (
    <View style={styles.notice}>
      <View style={styles.noticeFill} />
      {/* Wrapped in a `View` because `SymbolViewProps` is a plain object type
          with no accessibility props of its own — putting
          `accessibilityElementsHidden` on the `SymbolView` fails
          `check-types`. The glyph restates the copy, so VoiceOver reads the
          copy only: the same call `components/empty-state.tsx` makes for its
          symbol. */}
      <View accessibilityElementsHidden>
        <SymbolView
          name="exclamationmark.triangle.fill"
          size={14}
          tintColor={PlatformColor("systemOrange")}
        />
      </View>
      <Text style={styles.noticeText}>{TITLE_MATCH_NOTICE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  question: { ...Type.headline, color: PlatformColor("label"), paddingBottom: 10 },

  source: { flexDirection: "row", alignItems: "center", gap: 12 },
  cover: {
    borderRadius: 8,
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  sourceText: { flex: 1, gap: 2 },
  sourceTitle: { ...Type.subheadline, color: PlatformColor("label") },
  sourceAuthor: { ...Type.footnote, color: PlatformColor("secondaryLabel") },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PlatformColor("systemOrange"),
    overflow: "hidden",
  },
  noticeFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PlatformColor("systemOrange"),
    opacity: 0.12,
  },
  noticeText: { ...Type.footnote, color: PlatformColor("label"), flex: 1 },
});
```

- [ ] **Step 2: Collapse the screen's two branches into one list**

In `apps/mobile/src/features/share/share-screen.tsx`, replace the `QueryBoundary` block (currently `:69-90`) with:

```tsx
  return (
    <QueryBoundary query={identify}>
      {(data) => (
        <FlatList
          style={Screen.fill}
          // Without `flexGrow: 1` the empty component is cloned into the
          // content container with no height and gets clipped — see
          // `theme.ts`. `backlog-screen.tsx` carries a header and an empty
          // component the same way.
          contentContainerStyle={Screen.listContent}
          data={data.items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          // Keeps the first row out from under the header, and lets the
          // large title collapse on scroll.
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={
            <ShareHeader source={data.source} identified={data.identified} />
          }
          ListEmptyComponent={
            <EmptyState
              {...noMatch(data.identified, data.guesses)}
              action={{ label: "Search Instead", onPress: onSearch }}
            />
          }
        />
      )}
    </QueryBoundary>
  );
```

- [ ] **Step 3: Fix the imports and delete the moved styles**

`share-screen.tsx` no longer renders `Text` or the header `View`, and no longer needs `Type` or `TITLE_MATCH_NOTICE`. Set the imports to:

```tsx
import type { GameSummaryWire } from "@repo/contracts";
import { useCallback } from "react";
import { FlatList } from "react-native";

import { useIdentifyShare } from "@/api/hooks";
import { EmptyState } from "@/components/empty-state";
import { GameRow } from "@/components/game-row";
import { QueryBoundary } from "@/components/query-boundary";
import { LoadingState } from "@/components/query-states";
import { summarySubtitle } from "@/features/game/format";
import { NO_LINK, UNREADABLE, noMatch } from "@/features/share/empty-states";
import { ShareHeader } from "@/features/share/share-header";
import { Screen } from "@/theme";
```

Then delete the whole `const styles = StyleSheet.create({...})` block at the bottom of the file — all four rules moved into `share-header.tsx`. The four pre-query states above (`isPending`, `error`, `url === null`) and the comment explaining their order are untouched.

- [ ] **Step 4: Type-check and lint**

```bash
pnpm --filter mobile check-types && pnpm --filter mobile lint
```

Expected: PASS. `lint` runs with `--max-warnings 0`, so an unused import from Step 3 fails it.

- [ ] **Step 5: Run the mobile suite**

```bash
pnpm --filter mobile test
```

Expected: PASS, unchanged. Nothing here renders components; this proves the edits did not break a module graph that a pure test imports.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/share/share-header.tsx \
  apps/mobile/src/features/share/share-screen.tsx
git commit -m "feat(mobile): source preview and fallback warning on the share screen"
```

---

### Task 4: Large title and the close button

**Files:**
- Modify: `apps/mobile/src/app/shared/index.tsx:38-51`

**Interfaces:**
- Consumes: `goHome` — already defined in this file, and unchanged.
- Produces: nothing other tasks read.

- [ ] **Step 1: Confirm the props against the versioned docs**

Read https://docs.expo.dev/versions/v57.0.0/sdk/router/stack and confirm three things before editing: `Stack.Title` takes `large?: boolean`; `Stack.Toolbar` takes `placement` of `'left' | 'right' | 'bottom'`; `Stack.Toolbar.Button` accepts an SF Symbol `icon` with no children. In-repo precedents are `app/(tabs)/search/index.tsx:12` for the large title and `components/profile-toolbar.tsx:35-40` for an icon-only button.

- [ ] **Step 2: Make the edit**

Replace lines 38-51 of `apps/mobile/src/app/shared/index.tsx` with:

```tsx
      <Stack.Title large>Shared</Stack.Title>

      {/* A toolbar button, not `Stack.Screen.BackButton`: this is the root of a
          modal with nothing behind it to pop to, and leaving needs to clear the
          payload as well as navigate. Icon-only, like the `star.fill` button in
          `components/profile-toolbar.tsx`. */}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="xmark" accessibilityLabel="Close" onPress={goHome} />
      </Stack.Toolbar>
```

Everything else in the file is unchanged, including the `goHome`/`search`/`openGame` callbacks and the long comment above `goHome` about `clear()` and `dismissTo`.

- [ ] **Step 3: Type-check and lint**

```bash
pnpm --filter mobile check-types && pnpm --filter mobile lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/shared/index.tsx
git commit -m "feat(mobile): large title and close button on the share screen"
```

---

### Task 5: Device checks

None of the visual work is unit-testable — `apps/mobile/test` has no render harness — so the checklist is where it gets verified. This is the same call recorded in `docs/superpowers/specs/2026-08-28-mobile-onboarding-design.md`.

**Files:**
- Modify: `docs/mobile-device-verification.md` — check 38, and the end of `## Share intent checks` (which currently ends at check 43)

- [ ] **Step 1: Rewrite check 38**

Check 38 currently names "the toolbar Home button" and its position, both of which this plan changes. Its assertions still stand. Replace it with:

```markdown
- [ ] **38. The toolbar close button returns to the Home tab and clears the
      payload.** It is a right-placed `Stack.Toolbar` button with an `xmark`
      icon rather than a system back button, because a modal root has nothing
      behind it to pop to. Tap it, then force-quit and relaunch: the share
      must **not** re-present, which is the `clear()` call. Landing on Home
      rather than the tab the share interrupted is intended — that is
      `dismissTo("/")`. VoiceOver must announce it as "Close".
```

- [ ] **Step 2: Append the new checks**

Add at the end of `## Share intent checks`, after check 43:

```markdown
- [ ] **44. A YouTube share shows a wide cover with no black bars.** The
      oEmbed thumbnail is `hqdefault.jpg` at 480x360 — 4:3, with letterbox
      bars baked in — and it is rendered in a 100x56 box with
      `contentFit="cover"`, which crops exactly the bars. Bars on screen mean
      the aspect in `features/share/source-thumb.ts` is being ignored.
- [ ] **45. A TikTok share shows a tall 32x56 cover.** Same row height as
      item 44; only the width differs.
- [ ] **46. A video with no thumbnail shows the placeholder, not a broken
      image.** A `play.rectangle.fill` glyph at the same dimensions, so the
      row does not shift. This is also what an expired TikTok signed url must
      degrade to, via `onError` — hard to force on demand, so if a TikTok
      share ever shows an empty box rather than the glyph, that is the bug.
- [ ] **47. The fallback warning is legible in light and dark mode.** Share a
      video whose game cannot be identified. Expect an orange-bordered box
      with a faint orange fill and `label`-coloured copy. Toggle
      Appearance in Control Center without leaving the screen: border, glyph
      and fill must all follow, because all three are
      `PlatformColor("systemOrange")`.
- [ ] **48. The large title collapses on scroll inside the modal.** Share a
      video with enough candidates to scroll. "Shared" must start large and
      shrink into the navigation bar. This is what
      `contentInsetAdjustmentBehavior="automatic"` buys, and it is untested
      on a `fullScreenModal` root.
- [ ] **49. The no-match state still shows the header.** Share a video whose
      game is not in the catalogue. Expect the question, source row and — if
      the game could not be identified — the warning, all *above* the "No
      match in the catalogue" state, with `Search Instead` still working from
      there. A clipped or zero-height empty state means
      `contentContainerStyle={Screen.listContent}` was dropped.
```

- [ ] **Step 3: Commit**

```bash
git add docs/mobile-device-verification.md
git commit -m "docs: device checks for the share source preview"
```

---

## Verification

After Task 5, from the repo root with Docker running:

```bash
pnpm --filter @repo/contracts build && pnpm test && pnpm check-types && pnpm lint
```

Then build to a device and work checks 38 and 44-49.

## Plan Self-Review

**Spec coverage.** §3 contract → Task 1 Step 6. §4.1 oEmbed → Task 1 Steps 1-5. §4.2 cache key → Task 1 Step 9. §4.3 route body → Task 1 Step 10. §5 pure module → Task 2. §6 header component → Task 3 Step 1. §7 screen → Task 3 Steps 2-3. §8 route → Task 4. §9 files → the File Structure table. §10 testing → Task 1 Steps 1-2 and 7, Task 2 Step 1. §11 device checks → Task 5. §12 consequences → carried as comments in the code they justify. No gaps.

**Placeholder scan.** No "TBD", "handle edge cases", or "similar to Task N". Every code step carries the literal code; the two "similar to" temptations — the three existing oEmbed assertions and the repeated `?? null` reasoning — are written out in full.

**Type consistency.** `thumbnailUrl` (never `thumbnail_url`) on both `VideoMeta` and `ShareSourceWire`; `thumbnail_url` only as the raw oEmbed key. `sourceThumbSize` is the single name across Tasks 2 and 3, returning `{ width, height }` and consumed as `size` spread into a style. `ShareHeader` takes `{ source, identified }` in both its definition and its call site.
