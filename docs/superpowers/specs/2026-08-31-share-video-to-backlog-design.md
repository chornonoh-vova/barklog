# Share a Video, Fetch the Game — Design

**Date:** 2026-08-31
**Status:** Approved for planning

## 1. Purpose

A player watching a gaming video on YouTube or TikTok has already decided the
game is interesting. Today, acting on that means leaving the video, opening
Barklog, switching to Search, and typing a title they may only half know —
"that RE2 thing". The video already carries the answer.

This document describes making Barklog a destination in the iOS share sheet.
The user hits share on a video, picks Barklog, and the app presents a bottom
sheet of the games the video is most likely about. Tapping one opens the normal
game detail screen, where the existing backlog controls take over unchanged.

The example that drove the design:

```
https://www.youtube.com/watch?v=1vs0lLIRt7w
  -> title:  "Can You Beat Resident Evil 2 WITHOUT Killing Anything?"
  -> author: "Snamwiches"
  -> Resident Evil 2 (2019), Resident Evil 2 (1998), ...
```

### Goals

- Barklog appears in the iOS share sheet for YouTube and TikTok links.
- One request identifies the game and returns up to 20 ranked candidates
  (15 by default) from the existing mirror.
- The user reaches a game detail screen in two taps: share, then pick.
- No new runtime dependency on IGDB, and no user request ever reaches it —
  §1 of `2026-08-25-barklog-api-design.md` still holds.
- The API half is fully testable without a network or a device.

### Non-goals

Instagram posts and reels (§19), Android intent filters, sharing _out_ of
Barklog, batch or multi-URL shares, images and video files as share payloads,
in-app paste-a-link entry, and any "what's new" surface telling existing users
the feature exists (§19).

## 2. Decisions

| Decision              | Choice                                                  | Why                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Share intake          | `expo-sharing`, `useIncomingShare()`                    | First-party as of SDK 57. Its config plugin generates the iOS Share Extension, the App Group and the activation rules, so no third-party plugin and no hand-written Swift. |
| Metadata source       | Keyless oEmbed                                          | `youtube.com/oembed` and `tiktok.com/oembed` need no key, no quota and no account. Verified against both on 2026-08-31.                                                    |
| Title extraction      | Claude Haiku 4.5                                        | Video titles name games in prose, abbreviations and nicknames. The mirror's `pg_trgm` index wants a short title, not an eight-word sentence.                               |
| Extraction failure    | Fail soft to the raw title                              | Matches the fail-open cache in `packages/cache`. A degraded answer beats a dead sheet.                                                                                     |
| Method                | `POST /api/games/identify`                              | An action, not a resource. Keeps an opaque third-party URL out of query strings and access logs. HTTP caching is useless here; we cache by video id server-side.           |
| Candidate search      | Reuse `searchGames`                                     | The extraction is the new work. Ranking against the mirror is a job the existing trigram query and its cache already do well.                                              |
| Result caching        | Cache metadata and extraction, never the candidate list | A game synced tonight appears in shares immediately instead of waiting out a share-level TTL.                                                                              |
| Sheet                 | Universal `BottomSheet` from `@expo/ui`                 | Takes plain React Native children, so `GameRow` and its IGDB covers work unchanged. The `@expo/ui/swift-ui` variant cannot render a remote image.                          |
| Placement             | A `/shared` modal route group                           | A share can arrive on any tab or with the app cold. A modal presented over the tab controller is tab-agnostic and returns the user exactly where they were.                |
| Rate limiting         | A fourth scope, `identify`                              | One call costs an outbound HTTP round trip plus an LLM call. No existing read is comparable.                                                                               |
| New workspace package | None                                                    | The pipeline is used only by `apps/api`. `apps/api/src/share/` beats a `packages/*` for it.                                                                                |

## 3. Data flow

```
iOS share sheet
   │
   │  ShareExtension writes the payload to group.gg.barklog.app
   ▼
+native-intent.ts ──▶ /shared ──▶ useIncomingShare() ──▶ URL
                                                          │
                          POST /api/games/identify { url } │
                                                          ▼
   canonicalise ──▶ oEmbed ──▶ Claude Haiku ──▶ searchGames ──▶ candidates
      (pure)        (7d cache)   (30d cache)     (existing cache)
```

Four steps, each a separate module with one job, so each is testable on its
own. Only two of them touch the network, and both are stubbed in tests.

## 4. Step 1 — canonicalising the URL

`apps/api/src/share/canonicalise.ts`. A pure function,
`string -> { provider, videoId } | null`, over these shapes:

| Shape                                                | Provider                 |
| ---------------------------------------------------- | ------------------------ |
| `youtube.com/watch?v=ID`, `m.youtube.com/watch?v=ID` | `youtube`                |
| `youtu.be/ID`                                        | `youtube`                |
| `youtube.com/shorts/ID`                              | `youtube`                |
| `tiktok.com/@user/video/ID`                          | `tiktok`                 |
| `vm.tiktok.com/CODE`, `tiktok.com/t/CODE`            | `tiktok`, after redirect |

TikTok's share sheet hands out short links, and the oEmbed endpoint will not
accept them, so those need one redirect resolution. **This is the only place in
Barklog that fetches a user-supplied URL, and therefore the whole SSRF
surface.** It is isolated in its own module with its own tests, and it is
constrained three ways:

- the input host must already be an allowlisted `tiktok.com` suffix,
- every hop's host must also be an allowlisted `tiktok.com` suffix,
- at most three hops, then give up.

Everything downstream fetches only the two fixed oEmbed hosts, which are
compile-time constants.

## 5. Step 2 — oEmbed metadata

`apps/api/src/share/oembed.ts`.

```
GET https://www.youtube.com/oembed?url=<encoded>&format=json
GET https://www.tiktok.com/oembed?url=<encoded>
```

Both were verified live on 2026-08-31. YouTube returns the video title and
`author_name`; TikTok returns the caption — hashtags included, which are useful
signal — and the creator name. The response is parsed with a valibot schema, so
this meets the same Standard Schema interface as everything else in the repo,
and a shape change upstream fails loudly rather than propagating `undefined`.

Timeout 5s. Cached under `oembed:{provider}:{videoId}` for 7 days: a published
video's title effectively never changes.

Only `title` and `author` are kept. The thumbnail is deliberately dropped —
the sheet's visual language is IGDB cover art, and a video still competing with
it makes the list harder to scan, not easier.

## 6. Step 3 — extraction with Claude

`apps/api/src/share/extract.ts`. One non-streaming call to `@anthropic-ai/sdk`.

```
model:         claude-haiku-4-5      (IDENTIFY_MODEL, overridable)
max_tokens:    256
output_config: { format: { type: "json_schema", schema } }
```

The schema is `{ titles: string[] }`, one to three entries, best guess first.
Three model-specific notes, all of which are easy to get wrong:

- **No `output_config.effort`.** Effort errors on Haiku 4.5; it is a
  Claude 4.6-and-later parameter.
- **No `thinking`.** Omitting it on a pre-4.6 model means no thinking, which is
  what a sub-second extraction wants. Haiku 4.5 would need the deprecated
  `budget_tokens` form to enable it, and it should not be enabled.
- **Parse tool and structured output JSON**, never string-match it.

Cost, at roughly 500 input and 60 output tokens against Haiku 4.5's $1/$5 per
MTok, is about **$0.0008 per unique video** — and only per *unique* video, since
step 3 is cached for 30 days. `IDENTIFY_MODEL` exists so a swap to
`claude-opus-5` (about $0.004, five times more, and needing `effort: "low"`
rather than nothing) is a one-line change if Haiku turns out weak on messy
titles.

### The cache key carries the prompt and the model

```
extract:{promptVersion}:{model}:{provider}:{videoId}
```

Both belong in the key. Editing the prompt or changing the model changes the
answer, and a 30-day TTL is long enough that stale extractions would otherwise
outlive several deploys.

### Failing soft, and where the boundary sits

`withCache` documents that it does no negative caching and that a throw inside
the loader propagates uncached — the same property `GET /:id/similar` already
relies on to avoid pinning a 404 for a full TTL. This design uses it the same
way, and the fail-soft catch therefore sits **outside** `withCache`:

- inside the loader, a Claude error throws, so nothing is cached;
- outside it, the catch falls back to searching the raw video title.

If it were the other way round, one transient API error would cache a degraded
answer for 30 days.

## 7. Step 4 — ranking against the mirror

`apps/api/src/share/identify.ts`. For each guess in order, run the existing
cached search at `limit: 8`; concatenate in guess order, dedupe by game id, cap
at the requested limit. The first guess's matches outrank the second's. No
scoring arithmetic — the guesses arrive ordered by the model, and `searchGames`
already ranks within a guess by similarity and popularity.

This needs the search-plus-cache block currently inline in the `/search`
handler factored into a small `cachedSearch(query, limit, offset)` helper in
`routes/games.ts`, used by both routes. That keeps `SEARCH_TTL_SECONDS`,
`EMPTY_SEARCH_TTL_SECONDS` and the search-version read in one place instead of
two.

Why this composition and not a `identify:{videoId}` cache over the whole
response: candidate quality depends on the mirror, and the mirror changes
nightly. Caching only the extraction means a newly synced game shows up in
shares on the next request.

## 8. The route

`POST /api/games/identify`, added to `gamesRoutes`.

```ts
// packages/contracts/src/share.ts
shareIdentifySchema = v.strictObject({
  url: /* trimmed, length-capped, URL, host in SHARE_HOSTS */,
  limit: v.optional(integerFrom(1, IDENTIFY_LIMIT_MAX), IDENTIFY_LIMIT_DEFAULT),
});
```

The host allowlist lives in the contract, not the route, so an unsupported host
is a 422 from the standard validation hook and needs no bespoke problem type.

```ts
interface ShareIdentifyResponse {
  source: { provider: "youtube" | "tiktok"; videoId: string; title: string; author: string | null };
  guesses: string[];
  items: GameSummaryWire[];
}
```

`source.title` lets the sheet show its provenance — _"From: Can You Beat
Resident Evil 2…"_ — and `guesses` drives the no-results copy. Both are free;
we already have them.

`Cache-Control: private, no-store`. The response is derived from a URL the user
just shared, and the server-side cache is the one that matters.

### Middleware interactions

Worth stating, because three of them apply to this route by virtue of being a
POST under `/api/*`:

- `requireJson()` runs on `["PUT", "POST", "PATCH"] /api/*`, so the request
  must carry `Content-Type: application/json`. The mobile client already sets
  it whenever a body is present.
- `ensureUserMiddleware` runs on every mutating method, so an identify call
  upserts the user row. Harmless, and arguably correct — it is the caller's
  first authenticated write-shaped action.
- The `write` rate-limit scope is bound to `/api/backlog/*` and does **not**
  catch this route, which is why it needs its own scope.

The new scope goes in `rate-limits.ts` as `identify: { limit: 10,
windowSeconds: 60 }` and is registered in `app.ts` before the `overall` scope,
most-specific-first, as the existing comment there requires.

There is no route conflict with `GET /api/games/:id`: the methods differ. A
future `GET /identify` would collide and must be registered ahead of `/:id`.

## 9. Failure behaviour

| Case                                                    | Result                                               |
| ------------------------------------------------------- | ---------------------------------------------------- |
| Host not YouTube or TikTok                              | 422 from the valibot schema                          |
| Short link resolves off-host, or exceeds three hops     | 422                                                  |
| Video deleted or private (oEmbed 401/403/404)           | 404 problem                                          |
| oEmbed timeout or 5xx                                   | 502 problem with `Retry-After`                       |
| Claude errors, times out, or returns unparseable output | **200.** Falls back to searching the raw video title |
| Extraction succeeded, mirror has no match               | **200** with `items: []` and `guesses` populated     |

The last two rows are the interesting ones. Neither is an error from the user's
point of view — one degrades quietly, the other is a real answer the sheet can
explain: _"We think this is about Resident Evil 2, but it's not in the
catalogue."_

## 10. Mobile share intake

`expo-sharing` is added to `apps/mobile`, and configured in `app.json`:

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
]
```

All three rules, because the three sources behave differently: YouTube offers a
bare **URL**, Safari on a watch page offers a **web page**, and TikTok offers
**text that contains** a URL. So a payload arrives either as
`contentType: "website"` with the link in `contentUri`, or as
`contentType: "text"` with the link somewhere inside `value`.

`extensionBundleIdentifier` and `appGroupId` default to
`gg.barklog.app.ShareExtension` and `group.gg.barklog.app`. Both defaults are
correct here, so neither is set.

`src/features/share/extract-url.ts` normalises the two cases to one
`string | null`. It is a pure function with no react-native in its module
graph, testable in plain Node, following the precedent
`features/onboarding/pages.ts` set.

### The native chore

This is the only part of the feature that cannot be done from the repo:

- `pnpm --filter mobile prebuild` and a fresh development build,
- a new App ID for `gg.barklog.app.ShareExtension` in the Apple Developer
  portal,
- the App Group capability enabled on **both** App IDs,
- EAS picking up two provisioning profiles instead of one.

Nothing in §17's task order is blocked on it, which is why the API ships first.

## 11. The navigation problem

`redirectSystemPath` in `+native-intent.ts` returns _a path to navigate to_.
There is no return value meaning "stay where you are". So an incoming share
must land on a route; a purely passive sheet mounted at the root is not
reachable from the share extension.

That collides with a decision this repo made on purpose. `src/app/_layout.tsx`
renders `Slot`, with a comment explaining that `(tabs)` is the only root route
and that a `Stack` would wrap the tab controller in a `UINavigationController`
for nothing. Under `Slot`, a sibling `/shared` route **replaces** the tab
controller rather than presenting over it: the tabs unmount, tab state is lost,
and dismissing has nowhere to return to.

**The root therefore becomes a `Stack`:**

```tsx
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="shared" options={{ presentation: "transparentModal" }} />
</Stack>
```

The cost is exactly the `UINavigationController` that comment was avoiding.
`headerShown: false` makes it invisible, but it is real, and the reversal must
be recorded where the original decision was: **the comment in `_layout.tsx` and
the "Tabs" paragraph in the README both change**, to say that a modal sibling
now has to present over the tabs.

```
src/app/
  +native-intent.ts    expo-sharing host -> "/shared", else pass through
  _layout.tsx          Slot -> Stack
  shared/
    _layout.tsx        transparent contentStyle on index, opaque on game/[id]
    index.tsx          the sheet
    game/[id].tsx      -> GameDetailScreen (fourth copy, per-tab pattern)
```

`game/[id].tsx` being a fourth near-identical file is consistent with the
existing choice to triplicate it per tab so a pushed detail screen stays inside
its stack. It supplies its own push target for the similar-games row, exactly
as the other three do.

**This nesting is the least certain part of the design** — a transparent modal
group whose second screen must be opaque. It is a per-screen `contentStyle`,
but it wants a device check before the rest of the sheet is built, not a
confident assertion here.

## 12. The sheet

`src/features/share/share-sheet.tsx`, using the universal `BottomSheet` from
the `@expo/ui` root export — **not** `@expo/ui/swift-ui`. The universal
component takes plain React Native children, so `GameRow`, `Cover`,
`QueryBoundary`, `EmptyState` and `summarySubtitle` are all reused as they
stand. The SwiftUI variant cannot: its `Image` accepts an SF Symbol, an
asset-catalog name or a local file URI, and every row here is remote IGDB cover
art. The README already documents that constraint; this is the first feature
where the universal component is the answer to it.

- `snapPoints={["half", "full"]}`, `contentPadding={0}` for a full-bleed list.
- Header: an SF symbol, "Barklog fetched these", and `source.title` beneath it
  as secondary text.
- Body: `FlatList` of `GameRow`. Resolving, empty and error states come from the
  existing `QueryBoundary` and `query-states`.
- Empty state uses `guesses`, plus a button into Search.

Two behaviours that are easy to miss and both matter:

**`isPresented` is driven by screen focus, not a local boolean.** Selecting a
candidate pushes `/shared/game/[id]`; the sheet collapses as focus leaves and
re-presents when the user comes back. "Wrong pick, go back" then works without
any extra state.

**`clearSharedPayloads()` must be called on dismiss.** Without it the payload
survives in the App Group and the next cold launch re-presents a stale share.
This is the bug most likely to reach a device unnoticed, so it gets an explicit
checklist line in §16.

### Cold start behind the gates

A share into a cold, signed-out install needs no code, and it is worth writing
down why so nobody adds defensive handling for it. `+native-intent.ts`
redirects to `/shared`, but `AuthGate` renders `AuthView` over everything, so
the route mounts invisibly. When sign-in completes the gate renders its
children, `/shared` is already the active route, and the sheet appears —
because the payload lives in the App Group, not in navigation state, and
`useIncomingShare()` reads it whenever the component mounts.

## 13. API layer additions

- `client.ts` — `RequestOptions.method` is `"GET" | "PUT" | "DELETE"`. **`"POST"`
  has to be added to the union**, the first POST in the app.
- `endpoints.ts` — `identifyShare(url)`.
- `keys.ts` — `games.identify(url)`. It sits under `games`, not `backlog`, and
  no backlog mutation invalidates it.
- `hooks.ts` — `useIdentifyShare(url)`, `enabled: url !== null`,
  `staleTime: Infinity`. The server's answer for a given video id is immutable
  for the life of its cache, so refetching on focus would only burn the
  `identify` rate limit.

## 14. Onboarding

A fifth page, inserted at index 3 of `ONBOARDING_PAGES` — **before** the IGDB
page, which stays last because attribution reads as the closer.

```ts
{
  id: "share",
  systemImage: "square.and.arrow.up",
  title: "Share a video, fetch the game",
  description:
    "Watching a game video on YouTube or TikTok? Share it to Barklog and " +
    "the dog fetches the game for your backlog.",
}
```

This is a data-only change. `onboarding-screen.tsx` maps over the tuple and
derives `isLast` from `nextPageId`, so there is no page count to update, and
`pageIndex`/`nextPageId` need no change — the `as const satisfies` keeps the
tuple length literal. Only `test/onboarding-pages.test.ts` moves with it.

**Reach, stated plainly:** `OnboardingGate` renders only on a first install
before an account exists, so **no existing user will ever see this page**.
Telling current users the feature exists needs a different surface, and that is
out of scope here (§19).

## 15. Files

### New

| File                                               | What                                           |
| -------------------------------------------------- | ---------------------------------------------- |
| `packages/contracts/src/share.ts`                  | URL schema, host allowlist, limits, wire types |
| `apps/api/src/share/canonicalise.ts`               | URL -> provider + video id; the SSRF boundary  |
| `apps/api/src/share/oembed.ts`                     | The two keyless metadata fetches               |
| `apps/api/src/share/extract.ts`                    | The Claude call and its cache                  |
| `apps/api/src/share/identify.ts`                   | Guess -> candidate merge and ranking           |
| `apps/mobile/src/app/+native-intent.ts`            | `expo-sharing` host -> `/shared`               |
| `apps/mobile/src/app/shared/_layout.tsx`           | The modal group                                |
| `apps/mobile/src/app/shared/index.tsx`             | The sheet route                                |
| `apps/mobile/src/app/shared/game/[id].tsx`         | Detail, fourth copy                            |
| `apps/mobile/src/features/share/share-sheet.tsx`   | The sheet                                      |
| `apps/mobile/src/features/share/use-shared-url.ts` | `useIncomingShare()` wrapper                   |
| `apps/mobile/src/features/share/extract-url.ts`    | Pure URL-from-payload                          |

### Changed

| File                                                   | Change                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `packages/contracts/src/index.ts`                      | Export `share.js`                                                          |
| `apps/api/src/routes/games.ts`                         | The route; factor out `cachedSearch`                                       |
| `apps/api/src/cache-keys.ts`                           | `oembedKey`, `extractKey`, two TTLs                                        |
| `apps/api/src/rate-limits.ts`                          | The `identify` scope                                                       |
| `apps/api/src/app.ts`                                  | Register it before `overall`                                               |
| `apps/api/src/types.ts`                                | `AppDeps.share: ShareProvider`                                             |
| `apps/api/src/env.ts`, `.env.example`                  | `ANTHROPIC_API_KEY`, `IDENTIFY_MODEL`                                      |
| `apps/api/package.json`                                | `@anthropic-ai/sdk`                                                        |
| `turbo.json`                                           | Both new vars in the `build`, `test`, `dev` and `start` `env` arrays       |
| `apps/mobile/app.json`                                 | The `expo-sharing` plugin block                                            |
| `apps/mobile/package.json`                             | `expo-sharing`                                                             |
| `apps/mobile/src/app/_layout.tsx`                      | `Slot` -> `Stack`, and its comment                                         |
| `apps/mobile/src/api/{client,endpoints,keys,hooks}.ts` | POST, endpoint, key, hook                                                  |
| `apps/mobile/src/features/onboarding/pages.ts`         | The fifth page                                                             |
| `README.md`                                            | Route table, mobile tree, Tabs paragraph, share section, experimental note |
| `docs/mobile-device-verification.md`                   | A share-intent section                                                     |

`AppDeps.share` is injected exactly as `auth: AuthProvider` already is, which
is what keeps the API suite network-free: both the oEmbed fetch and the Claude
call are stubbed, so the promise in the README that the tests need no network
survives intact.

## 16. Testing

| Level                | Covers                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts` | Every URL shape in §4 accepted; other hosts rejected; limit bounds                                                                                                                            |
| `apps/api` unit      | `canonicalise` including the three-hop cap and an off-host redirect; oEmbed schema parse and its failure modes; `extract` output parsing; the fail-soft fallback asserting a raw-title search |
| `apps/api` route     | `identify-routes.test.ts` under Testcontainers: happy path, unsupported host 422, deleted video 404, Claude-down fail-soft, zero-match 200, rate-limit 429                                    |
| `apps/mobile` unit   | `extract-url.test.ts` for both payload shapes; extended `api-endpoints` and `api-keys`; updated `onboarding-pages`                                                                            |
| Device               | The checklist below                                                                                                                                                                           |

Everything except the device row runs under `pnpm test` with no network.

### Device checklist

Added to `docs/mobile-device-verification.md`:

- Barklog appears in the share sheet from the YouTube app, the TikTok app, and
  Safari on a watch page.
- Warm launch, and cold launch, both present the sheet.
- Signed-out cold install: `AuthView` first, sheet after sign-in (§12).
- Dismissing clears the payload — relaunch does **not** re-present it.
- Pick a candidate, go back: the sheet re-presents.
- A private or deleted video shows the 404 copy, not a crash.
- Dismissing returns the user to the tab they started on, with its stack intact.

## 17. Task order

API first, so nothing waits on the Apple Developer portal.

| #   | Task                                                              | Verified by      |
| --- | ----------------------------------------------------------------- | ---------------- |
| 1   | Contracts: `share.ts`                                             | Unit, no network |
| 2   | `canonicalise` + `oembed`, `AppDeps.share`, cache keys            | Unit, stubbed    |
| 3   | `extract` — Haiku 4.5, structured output, fail-soft               | Unit, stubbed    |
| 4   | The route, the `identify` scope, `cachedSearch`, the merge        | Testcontainers   |
| 5   | Mobile API layer, POST in the method union                        | Unit             |
| 6   | Plugin, `+native-intent`, `Slot` -> `Stack`, `/shared`, the sheet | **Device only**  |
| 7   | The onboarding page                                               | Unit             |

Tasks 1–5 and 7 are fully verifiable in CI. Task 6 is not, and should begin
with the §11 presentation-nesting check on hardware before the rest of the
sheet is built.

## 18. Risks

| Risk                                                                                                                                                                        | Mitigation                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo marks iOS share-receiving **experimental** — the extension opens the main target rather than processing in a `ViewController`, which Apple does not officially support | Accepted, and recorded in the README next to the `platforms: ["ios"]` note. It works on SDK 57. A future iOS release or an App Review question could end it; the fallback is the deferred in-app paste entry, which needs no native target. |
| Haiku 4.5 is too weak for slang-heavy or vague titles                                                                                                                       | `IDENTIFY_MODEL` makes the swap to `claude-opus-5` one line. Measure on real shares before deciding.                                                                                                                                        |
| oEmbed is an undocumented-stability contract on TikTok's side                                                                                                               | The valibot response schema fails loudly rather than silently degrading, and the fail-soft path already handles a dead metadata step for the user.                                                                                          |
| Root `Slot` -> `Stack` regresses the tab controller                                                                                                                         | Covered by the last device-checklist line: dismissing must return to the originating tab with its stack intact.                                                                                                                             |
| A stale payload re-presents on launch                                                                                                                                       | An explicit `clearSharedPayloads()` on dismiss, plus its own checklist line.                                                                                                                                                                |
| The `identify` limit of 10/min is too tight for a curious user                                                                                                              | It is data in `rate-limits.ts`, overridable per deployment through `AppDeps.rateLimits`, as the other three scopes already are.                                                                                                             |
| Titles that never name a game ("I beat the hardest boss in gaming")                                                                                                         | Unfixable from metadata alone, and correctly handled: the zero-match 200 explains itself and offers Search.                                                                                                                                 |

## 19. Deferred

- **Instagram posts and reels.** A provider swap, not a redesign: steps 1, 3
  and 4 are unchanged and only `oembed.ts` grows a third source. Deferred
  because Instagram's oEmbed now requires a Facebook app token, which is an
  account and credential problem rather than a design one.
- **Android intent filters.** The plugin already supports
  `android.singleShareMimeTypes`; the app is `platforms: ["ios"]`.
- **In-app paste-a-link entry.** Would make the feature reachable without any
  native target, and is the fallback if the experimental iOS path breaks.
- **A "what's new" surface**, so existing users learn the feature exists (§14).
- **The video thumbnail in the sheet header** (§5).
- **IGDB `alternative_names` in the mirror.** Would improve ordinary search as
  well as this feature, and would shrink what the extraction step has to carry.
  It is a worker and schema change with its own value, so it belongs in its own
  spec rather than as a rider on this one.
