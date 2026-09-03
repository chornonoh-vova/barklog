# Share Source Preview — Design

**Date:** 2026-09-03
**Status:** Approved for planning

## 1. Purpose

The share screen answers "which game is this?" without ever showing what it
read. `apps/mobile/src/features/share/share-screen.tsx` renders
`data.source.title` as one line of secondary text and drops the rest of
`ShareSourceWire` on the floor. When identification fails, the reason arrives
as an unstyled footnote that looks like more of the same secondary text.

This design gives the screen a source preview — cover, title, author — and
promotes the fallback explanation to a bordered warning. It also moves the
screen to a large title and replaces its left "Home" button with a
right-placed close button.

Nothing about identification changes. This is a presentation change plus the
one wire field it requires.

### Goals

- The user can see which video Barklog read, including its cover art.
- Each provider's cover keeps its own shape, because the shape is the
  provider — a wide YouTube still, a tall TikTok card.
- The fallback notice reads as a warning in both light and dark mode.
- The preview survives the no-match case, which is where it matters most.

### Non-goals

- **No change to identification.** Extraction, guesses, `identified`, and the
  merge in `mergeCandidates` are untouched.
- **The source row is not tappable.** Opening the original video would add a
  `Linking` dependency and a leaving-the-app decision for no stated need.
- **No new copy.** `TITLE_MATCH_NOTICE` stands as written; only its container
  changes.
- **No `thumbnail_width`/`thumbnail_height` in the wire.** Section 2 explains
  why the reported aspect is the wrong aspect.

## 2. Decisions

| Question                        | Decision                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| Where does the cover come from? | `thumbnail_url` from the oEmbed response already being fetched    |
| Wire shape                      | One field: `ShareSourceWire.thumbnailUrl: string \| null`         |
| Cover shape                     | Provider-aware aspect — 16:9 YouTube, 9:16 TikTok                 |
| Cover size                      | Equal height across providers: 56pt, width from aspect            |
| Missing or failed cover         | A `play.rectangle.fill` placeholder at the same dimensions        |
| Warning treatment               | 1pt `systemOrange` border, `systemOrange` fill at `opacity: 0.12` |
| Warning copy colour             | `PlatformColor("label")` — the orange is border and glyph only    |
| No-match case                   | The header renders above the empty state, not instead of it       |
| List structure                  | One `FlatList` with both a header and an empty component          |
| Title                           | `<Stack.Title large>`                                             |
| Exit affordance                 | `Stack.Toolbar placement="right"`, icon-only `xmark`              |

Five decisions deserve their reasoning recorded.

**Display aspect, not reported aspect.** YouTube's oEmbed hands back
`hqdefault.jpg` at 480×360 with `thumbnail_width: 480`,
`thumbnail_height: 360`. That is 4:3, and for a 16:9 video the extra height is
black letterbox bars baked into the image. Rendering at the reported aspect
would therefore render the bars. Rendering a 16:9 box with
`contentFit="cover"` crops 480×360 down to 480×270 — precisely the video
frame with the bars removed. So the aspect must come from the provider, not
from the payload, and the two extra wire fields that would carry the payload's
aspect are not merely unnecessary but actively wrong to use.

The cost is that a rare landscape or square TikTok is centre-cropped to 9:16.
TikTok is overwhelmingly portrait; plumbing two fields to serve the exception
is not worth it.

**A lenient read of `thumbnail_url`.** The field is parsed as
`v.optional(v.unknown())` and narrowed by a local helper, not as
`v.pipe(v.string(), v.url())`. A strict schema entry would make a malformed
thumbnail fail the whole parse and turn a working identification into a 502.
This is the same reasoning already recorded at `apps/api/src/share/oembed.ts`
for `author_name`: a bad value in an otherwise valid 200 must not become an
error. The helper also drops any non-https url, because the value is handed
to the client to load.

**The oEmbed cache key gets a generation.** `VideoMeta` is what is cached
under `oembedKey`, for `OEMBED_TTL_SECONDS` — 7 days. `withCache` does not
validate: `packages/cache/src/with-cache.ts:14` is an unchecked
`cache.get<T>` cast. Every entry written before this ships would therefore
return without `thumbnailUrl`, as `undefined`, and JSON would drop the key on
the way out. The cached shape changed, so the key generation changes:
`oembed:v2:${provider}:${videoId}`. `feedKey` and `similarKey` in that same
file already version exactly this way. The route additionally writes
`meta.thumbnailUrl ?? null`, as belt-and-braces against that unchecked cast
in general.

**One list, two outcomes.** Today the post-query render forks: an
`EmptyState` when `data.items` is empty, a `FlatList` otherwise. Keeping the
header in the non-empty branch only would hide the source exactly when the
user most needs to know what was read. `apps/mobile/src/features/backlog/backlog-screen.tsx`
already solves this: one list carrying both a `ListHeaderComponent` and a
`ListEmptyComponent`, with `contentContainerStyle={Screen.listContent}`. That
`flexGrow: 1` is load-bearing for the reason `apps/mobile/src/theme.ts`
records — an empty component is cloned into the content container and without
it has no height and gets clipped.

**The warning introduces no hex literal.** `apps/mobile/src/theme.ts` states
that `Brand.tint` is the only hex literal in the app and every other colour
comes from `PlatformColor`. React Native will not apply alpha to a
`PlatformColor`, so the translucent fill is `PlatformColor("systemOrange")` on
an absolutely-filled child view at `opacity: 0.12`. Border, glyph, and fill
are then all the same dynamic colour, and all three track light and dark for
free. A louder variant — orange copy on a stronger fill — was rejected
because it needs hand-picked oranges per mode, which means four new hex
literals, and because it reads as an error rather than a notice.

### Rejected alternatives

- **Derive the YouTube thumbnail client-side** from `videoId` as
  `i.ytimg.com/vi/<id>/mqdefault.jpg`. Needs no wire change and never
  expires, but leaves TikTok with no cover at all.
- **One fixed shape for both providers.** A 16:9 box reduces a TikTok cover
  to a thin centre band; a square keeps YouTube's letterbox bars, because
  cropping 4:3 to 1:1 trims the sides rather than the top and bottom.
- **Equal-area or equal-width sizing.** Equal area matches the two providers'
  visual weight but makes a TikTok header 112pt tall; equal width pushes it to
  171pt and drives the game results toward the fold. Equal height keeps the
  results high on the screen, at the cost of a 32pt-wide TikTok cover.
- **Pinning the warning above the list.** It is context for the results, not
  a persistent alert, so it scrolls with them.

## 3. The contract

`packages/contracts/src/share.ts`, `ShareSourceWire`, one new member:

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

Additive and nullable, so an older client that ignores the field is
unaffected.

## 4. The API

### 4.1 `apps/api/src/share/oembed.ts`

`VideoMeta` gains `thumbnailUrl: string | null`. The schema gains one entry:

```ts
const oembedSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1)),
  author_name: v.nullish(v.pipe(v.string(), v.trim())),
  // Deliberately `unknown`, narrowed below rather than validated here: a
  // malformed thumbnail must not fail the parse and turn a working
  // identification into a 502.
  thumbnail_url: v.optional(v.unknown()),
});
```

And a local helper beside it:

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

`fetchVideoMeta` returns `thumbnailUrl: httpsUrlOrNull(parsed.output.thumbnail_url)`.

### 4.2 `apps/api/src/cache-keys.ts`

```ts
export function oembedKey(provider: ShareProviderName, videoId: string): string {
  // `v2`: the cached value is a `VideoMeta`, and it gained `thumbnailUrl`.
  // Entries from the previous generation would deserialise without it.
  return `oembed:v2:${provider}:${videoId}`;
}
```

`OEMBED_TTL_SECONDS` is unchanged. Its comment — a published video's title
effectively never changes — stays true of the title, and the added URL's
expiry is handled on the client, not by shortening the TTL.

### 4.3 `apps/api/src/routes/games.ts`

The `source` object in the `ShareIdentifyResponse` body gains
`thumbnailUrl: meta.thumbnailUrl ?? null`. Nothing else in the route changes:
the meta fetch, both `withCache` calls, the fail-soft extraction path and its
log line, and the `private, no-store` header are all untouched.

## 5. Mobile — the pure module

New `apps/mobile/src/features/share/source-thumb.ts`. Pure, with no
react-native in its module graph, so it tests in plain Node — the same
structure and the same reason already recorded in
`features/share/extract-url.ts` and `features/share/empty-states.ts`.

```ts
import type { ShareProviderName } from "@repo/contracts";

/** Equal across providers, so the row's height never depends on the source. */
const SOURCE_THUMB_HEIGHT = 56;

/**
 * The aspect we render at, which is not the aspect oEmbed reports. YouTube's
 * thumbnail is `hqdefault.jpg` at 480x360 — 4:3, with letterbox bars baked
 * in — so a 16:9 box with `contentFit="cover"` crops off exactly the bars.
 * TikTok's cover is already portrait, so 9:16 crops nothing.
 */
const ASPECT: Record<ShareProviderName, number> = {
  youtube: 16 / 9,
  tiktok: 9 / 16,
};

/** Whole points, so the image never lands on a half-pixel edge. */
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

YouTube resolves to 100×56, TikTok to 32×56.

## 6. Mobile — the header component

New `apps/mobile/src/features/share/share-header.tsx`, exporting
`ShareHeader({ source, identified })`. It is the whole `ListHeaderComponent`,
in three parts.

It owns its own padding: the `paddingHorizontal: 16`, `paddingTop: 8`,
`paddingBottom: 12` block currently on `styles.header` in `share-screen.tsx`
moves here with it, so the list stays responsible only for the list.

**The question.** `Which game is this?` at `Type.headline` on
`PlatformColor("label")` — unchanged from what the screen renders today.

**The source row.** A horizontal row: the cover at
`sourceThumbSize(source.provider)`, then a text column holding
`source.title` at `Type.subheadline` on `label` with `numberOfLines={2}`, and
`source.author` at `Type.footnote` on `secondaryLabel` with
`numberOfLines={1}`, omitted entirely when `null`.

The cover is `expo-image` with `contentFit="cover"`, `cachePolicy="disk"`, a
`borderRadius` of 8 and a `secondarySystemGroupedBackground` backing. A null
`thumbnailUrl` — or an `onError` from a url that has expired — renders a
`play.rectangle.fill` `SymbolView` on that same background at the same
dimensions, so the layout is identical either way. This mirrors how `Cover`
handles a null `imageId` in `apps/mobile/src/components/cover.tsx`, with two
differences: the shape comes from the provider rather than `COVER_ASPECT`,
and the fallback must also cover a load failure, not only a missing id.

The cover is decorative — the title beside it says everything the cover says
— so it is hidden from VoiceOver and the two `Text` nodes read on their own.

**The warning.** Rendered only when `identified === false`:

- container: `borderWidth: 1`, `borderColor: PlatformColor("systemOrange")`,
  `borderRadius: 10`, `overflow: "hidden"`
- fill: a child on `StyleSheet.absoluteFill` with
  `backgroundColor: PlatformColor("systemOrange")` and `opacity: 0.12`
- glyph: `exclamationmark.triangle.fill`, tinted `systemOrange`, hidden from
  VoiceOver because the copy beside it says the same thing — the call
  `components/empty-state.tsx` already makes for its symbol
- copy: `TITLE_MATCH_NOTICE` at `Type.footnote` on `PlatformColor("label")`

## 7. Mobile — the screen

`apps/mobile/src/features/share/share-screen.tsx` keeps its four pre-query
states and their ordering exactly as they are, including the comment
recording why `isPending` must be checked first: those states have no
`source` to preview.

Inside the `QueryBoundary`, the two branches collapse into one `FlatList`:

- `ListHeaderComponent={<ShareHeader source={data.source} identified={data.identified} />}`
- `ListEmptyComponent` — the existing `EmptyState` with
  `noMatch(data.identified, data.guesses)` and the `Search Instead` action
- `contentContainerStyle={Screen.listContent}`, without which the empty
  component is clipped
- `contentInsetAdjustmentBehavior="automatic"` retained — it is what keeps the
  first row clear of the header and what lets the large title collapse

The inline header `View` and its `styles.question` / `styles.source` /
`styles.notice` rules move out of this file into `share-header.tsx`.

The warning restates part of what `noMatch` says in the empty case. That
redundancy is accepted: suppressing the banner there would make the header
conditional on the result count for a benefit only visible in one state.

## 8. Mobile — the route

`apps/mobile/src/app/shared/index.tsx`:

- `<Stack.Title>` becomes `<Stack.Title large>`, matching the pattern in
  `app/(tabs)/(home)/index.tsx`, `app/(tabs)/explore/index.tsx` and
  `app/(tabs)/search/index.tsx`.
- The toolbar moves from `placement="left"` to `placement="right"`, and the
  button from `icon="chevron.left"` with the child label `Home` to an
  icon-only `icon="xmark"` with `accessibilityLabel="Close"`. An icon-only
  `Stack.Toolbar.Button` is proven by the `star.fill` button in
  `apps/mobile/src/components/profile-toolbar.tsx`, which passes no children.

`goHome` remains the handler, so `clear()`-before-exit and `dismissTo("/")`
are unchanged. The existing comment above the toolbar stays: its reasoning —
a modal root has nothing behind it to pop to, and leaving must clear the
payload as well as navigate — is still exactly why this is a toolbar button
rather than `Stack.Screen.BackButton`. Only the icon, placement and label
change, and the comment is updated to say `Close` rather than `Home`.

Expo's versioned documentation at https://docs.expo.dev/versions/v57.0.0/ is
to be read for `Stack.Title` and `Stack.Toolbar` before this file is edited,
per `apps/mobile/AGENTS.md`.

## 9. Files

### New

| File                                              | Purpose                              |
| ------------------------------------------------- | ------------------------------------ |
| `apps/mobile/src/features/share/source-thumb.ts`  | Provider aspect and cover dimensions |
| `apps/mobile/src/features/share/share-header.tsx` | Question, source row, warning        |
| `apps/mobile/test/source-thumb.test.ts`           | Unit tests for the above             |

### Changed

| File                                              | Change                                 |
| ------------------------------------------------- | -------------------------------------- |
| `packages/contracts/src/share.ts`                 | `thumbnailUrl` on `ShareSourceWire`    |
| `apps/api/src/share/oembed.ts`                    | Read and narrow `thumbnail_url`        |
| `apps/api/src/cache-keys.ts`                      | `oembedKey` gains a `v2` generation    |
| `apps/api/src/routes/games.ts`                    | `thumbnailUrl` on the response body    |
| `apps/api/test/share-oembed.test.ts`              | Thumbnail cases                        |
| `apps/api/test/identify-routes.test.ts`           | `thumbnailUrl` in the asserted body    |
| `apps/mobile/src/features/share/share-screen.tsx` | One list; header extracted             |
| `apps/mobile/src/app/shared/index.tsx`            | Large title; right-placed close button |
| `docs/mobile-device-verification.md`              | Rewrite check 38; add checks 44 onward |

## 10. Testing

### `apps/api`

`share-oembed.test.ts` gains four cases: a thumbnail present and returned; a
thumbnail absent, giving `null`; a non-string `thumbnail_url`, giving `null`
rather than throwing; and an `http://` thumbnail, dropped. Each must also
assert the surrounding parse still succeeds — the point of every one of them
is that a bad thumbnail is not an error.

`identify-routes.test.ts` gains `thumbnailUrl` to its asserted `source`, and
a case proving a video whose oEmbed carries no thumbnail still answers 200.

### `apps/mobile`

`test/source-thumb.test.ts`: the height is 56 for both providers; YouTube is
wider than tall and TikTok taller than wide; the exact values are 100×56 and
32×56, so a change in the rounding is visible rather than silent.

There is no react-native render harness in `apps/mobile/test` — all 25 files
there are pure-Node vitest. The header component, the placeholder, the
banner's appearance and the large title are therefore not unit-testable here,
and go to the device checklist instead. This is the same call recorded in
`docs/superpowers/specs/2026-08-28-mobile-onboarding-design.md`.

## 11. Device checks

`docs/mobile-device-verification.md` runs to check 43. Its **check 38
describes the toolbar Home button by name and position and must be
rewritten** for the close button; its assertions still stand — force-quit and
relaunch must not re-present the share, which is the `clear()` call, and
landing on Home is intended.

New checks under `## Share intent checks`, numbered 44 onward:

- A YouTube share shows a wide cover with no black bars.
- A TikTok share shows a tall cover.
- A video with no thumbnail, or an expired TikTok url, shows the
  `play.rectangle.fill` placeholder and no layout shift — not a broken image.
- The warning is legible in both light and dark mode.
- The large title collapses on scroll inside the `fullScreenModal`.
- The no-match state still shows the question, source row and warning above
  the empty state, and `Search Instead` still works from there.

## 12. Consequences

| Consequence                                                             | Response                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A TikTok signed url can expire inside the 7-day oEmbed TTL              | The placeholder path in §6 catches it; it renders as a missing thumbnail does. The expired url itself is what's cached, so every share of that video shows the placeholder for the rest of the TTL |
| The `v2` key bump discards the existing oEmbed cache                    | One extra oEmbed call per video, once. The endpoint is cheap and unauthenticated                                                                                                                   |
| A landscape or square TikTok is centre-cropped                          | Accepted in §2                                                                                                                                                                                     |
| A 32pt-wide TikTok cover is small                                       | Accepted: equal height keeps the game results high on the screen, which matters more                                                                                                               |
| The warning restates `noMatch` copy in the empty case                   | Accepted in §7                                                                                                                                                                                     |
| Removing the left button removes the visible word "Home"                | The close button carries `accessibilityLabel="Close"`; the destination is unchanged. Check 38                                                                                                      |
| A large title on a modal root may not collapse as it does on a tab root | Device check. `contentInsetAdjustmentBehavior="automatic"` is already in place                                                                                                                     |
