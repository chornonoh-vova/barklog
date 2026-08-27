# Barklog Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Expo app to the Barklog API — Clerk native authentication guarding the whole app, a typed fetch layer over TanStack Query, and four screens on real endpoints.

**Architecture:** Three layers with hard boundaries. Wire shapes are declared once in `packages/contracts` and shared by API and app. A transport layer (`createApiClient`) is a plain function of `{ baseUrl, getToken }` with no React in it, so its error handling is unit-testable in Node. Presentation is React Native for lists, images and text content, with `@expo/ui/swift-ui` controls embedded in `Host` islands.

**Tech Stack:** Expo SDK 57, expo-router 57 (native tabs + declarative Stack), `@clerk/expo` 4.6 native components, `@tanstack/react-query` 5, `@expo/ui/swift-ui`, `expo-image`, `expo-linear-gradient`, `expo-symbols`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-barklog-mobile-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Read `apps/mobile/AGENTS.md`:** Expo has changed. Consult the exact versioned docs at `https://docs.expo.dev/versions/v57.0.0/` before writing Expo code.
- **Testable modules must not import from `react-native` or `@expo/ui`.** Vitest runs in plain Node with no React Native transform. Any module with a unit test imports only from `@repo/contracts` and the standard library. Where platform data is needed, the pure function takes it as a parameter and a separate untested one-line module supplies it.
- **Package manager is pnpm; the monorepo is Turborepo.** Run package scripts as `pnpm --filter mobile <script>`. Install Expo dependencies with `npx expo install` from `apps/mobile` so SDK 57-compatible versions are resolved — never `pnpm add` for an `expo-*` or React Native package.
- **Every new `EXPO_PUBLIC_*` variable must be added to `turbo.json`** under the `build` and `dev` tasks' `env` arrays, or `turbo/no-undeclared-env-vars` fails lint.
- **Colours:** all React Native colour comes from `PlatformColor("label" | "secondaryLabel" | "separator" | "systemBackground" | "secondarySystemGroupedBackground")`. Never a hex literal, never a `useColorScheme` branch. The only hex in the app is `Brand.tint` in `src/theme.ts`, passed to `<Host seedColor>`.
- **Status order for display is `["playing", "waiting", "completed", "abandoned"]`.** Do NOT reorder `BACKLOG_STATUSES` in `packages/contracts/src/backlog.ts` — it is the Postgres enum's declaration order and `packages/db`'s status-parity test depends on it.
- **Tab set is Home, Explore, Search.** There is no Profile tab.
- **Rating range is 1–10 inclusive**, integer, nullable. `RATING_MIN` and `RATING_MAX` are exported from `@repo/contracts`.
- **Search requires `q` ≥ 2 characters**; `limit` ≤ 50; `offset` ≤ 200.
- **`glass` and `glassProminent` button styles are iOS 26+.** Always resolve them through `glassButtonStyle()` (Task 4).
- **Commit after every task.** Conventional Commits, matching the repo's existing style (`feat(mobile):`, `test(mobile):`, `chore(mobile):`).
- **Verification before completion:** `pnpm lint`, `pnpm check-types` and `pnpm test` must pass at the end of every task. Never claim a task done without running them.

## Task 0: Prerequisites (human, not automatable)

These are Apple and Clerk dashboard steps. The `@clerk/expo` config plugin adds
the `com.apple.developer.applesignin` entitlement, and **code signing fails**
unless the App ID carries the matching capability. Do these before Task 2.

- [ ] Apple Developer portal → Identifiers → App ID `gg.barklog.app` → enable the **Sign In with Apple** capability.
- [ ] Clerk Dashboard → **Native Applications** → add the iOS app: Apple Team ID + bundle identifier `gg.barklog.app`.
- [ ] Clerk Dashboard → **SSO connections** → enable **Apple**.
- [ ] Create `apps/mobile/.env` (gitignored) with:

```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<same value as CLERK_PUBLISHABLE_KEY in apps/api/.env>
```

The publishable key **must** be from the same Clerk instance as the API's
`CLERK_SECRET_KEY`, or every request returns 401 with nothing in the app to
explain it. On a physical device replace `localhost` with the host machine's LAN IP.

---

## File Structure

**`packages/contracts`**

| File                    | Responsibility                        |
| ----------------------- | ------------------------------------- |
| `src/wire.ts` (create)  | Every HTTP response shape, types only |
| `src/index.ts` (modify) | Re-export `./wire.js`                 |

**`apps/api`**

| File                        | Responsibility                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/serialize.ts` (modify) | Delete local wire interfaces; re-export the contracts ones; keep the row → wire mapping functions |

**`apps/mobile` — non-React (unit-tested)**

| File                                   | Responsibility                                         |
| -------------------------------------- | ------------------------------------------------------ |
| `src/igdb-image.ts`                    | IGDB image URL construction                            |
| `src/ui/glass.ts`                      | iOS-version-aware button style resolution (pure)       |
| `src/api/errors.ts`                    | `ApiError`, problem-document parsing                   |
| `src/api/client.ts`                    | `createApiClient` — auth header, JSON, status handling |
| `src/api/endpoints.ts`                 | One function per route                                 |
| `src/api/keys.ts`                      | TanStack query key factory                             |
| `src/auth/should-clear-cache.ts`       | Sign-out transition predicate                          |
| `src/features/backlog/sections.ts`     | Status grouping and ordering                           |
| `src/features/backlog/empty-states.ts` | Per-status empty-state copy                            |
| `src/features/game/format.ts`          | Display label builders                                 |

**`apps/mobile` — React**

| File                                       | Responsibility                                                     |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `src/query-client.ts`                      | `QueryClient` factory with retry/staleTime policy                  |
| `src/api/provider.tsx`                     | React context holding an `ApiClient` built from Clerk's `getToken` |
| `src/api/hooks.ts`                         | Query and mutation hooks                                           |
| `src/auth/auth-gate.tsx`                   | Splash / `AuthView` / children                                     |
| `src/ui/platform-glass.ts`                 | Reads `Platform.Version`, calls `glassButtonStyle`                 |
| `src/components/profile-toolbar.tsx`       | `Stack.Toolbar` + `UserButton`                                     |
| `src/components/cover.tsx`                 | `expo-image` cover with size variants and placeholder              |
| `src/components/game-row.tsx`              | Pressable list row                                                 |
| `src/components/query-boundary.tsx`        | Pending / error presentation                                       |
| `src/features/backlog/backlog-screen.tsx`  | Home                                                               |
| `src/features/explore/explore-screen.tsx`  | Explore                                                            |
| `src/features/search/search-screen.tsx`    | Search                                                             |
| `src/features/game/game-detail-screen.tsx` | Game detail                                                        |
| `src/theme.ts` (modify)                    | `Brand.tint` + type scale                                          |

**`apps/mobile` — routes**

Create `app/(tabs)/(home)/_layout.tsx`, `app/(tabs)/(home)/index.tsx`,
`app/(tabs)/(home)/game/[id].tsx`, `app/(tabs)/explore/_layout.tsx`,
`app/(tabs)/explore/index.tsx`, `app/(tabs)/explore/game/[id].tsx`,
`app/(tabs)/search/game/[id].tsx`.
Modify `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/(tabs)/search/index.tsx`.
Delete `app/(tabs)/profile.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`,
`src/components/placeholder-screen.tsx`.

---

## Task 1: Wire contract in `@repo/contracts`

Lands before anything mobile, so the app is never written against types that are
about to move.

**Files:**

- Create: `packages/contracts/src/wire.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/serialize.ts`

**Interfaces:**

- Consumes: `BacklogStatus` from `packages/contracts/src/backlog.ts`
- Produces: `GameSummaryWire`, `GameDetailWire`, `BacklogEntryWire`, `BacklogListItemWire`, `GameListResponse`, `GameDetailResponse`, `BacklogListResponse`, `BacklogStatsWire`, `ProblemDocument`, `NamedRef`, `PlatformRef` — all exported from `@repo/contracts`

- [ ] **Step 1: Create the wire module**

`packages/contracts/src/wire.ts`:

```ts
import type { BacklogStatus } from "./backlog.js";

/**
 * Every HTTP response shape the API returns, declared once and shared with the
 * Expo app. Types only — no valibot, no runtime code, nothing from `@repo/db`.
 * `packages/contracts` must stay free of Node dependencies so the mobile bundle
 * never pulls one in.
 *
 * Dates are ISO strings here, not `Date`: `apps/api/src/serialize.ts` converts
 * them before anything is cached or hashed.
 */

export interface NamedRef {
  id: number;
  name: string;
  slug: string;
}

export interface PlatformRef extends NamedRef {
  abbreviation: string | null;
}

export interface GameSummaryWire {
  id: number;
  name: string;
  slug: string;
  coverImageId: string | null;
  firstReleaseDate: string | null;
  totalRating: number | null;
  totalRatingCount: number;
}

export interface GameDetailWire extends GameSummaryWire {
  summary: string | null;
  gameType: { id: number; name: string } | null;
  parentGame: { id: number; name: string } | null;
  screenshots: string[];
  genres: NamedRef[];
  platforms: PlatformRef[];
  developers: NamedRef[];
  publishers: NamedRef[];
}

export interface BacklogEntryWire {
  gameId: number;
  status: BacklogStatus;
  rating: number | null;
  addedAt: string;
  updatedAt: string;
}

export interface BacklogListItemWire extends BacklogEntryWire {
  game: GameSummaryWire;
}

/** `GET /api/games/search`, `GET /api/games/popular` */
export interface GameListResponse {
  items: GameSummaryWire[];
}

/**
 * `GET /api/games/:id`. The embedded `backlogEntry` is what gives the game
 * screen the right button state in one request — and what makes the response
 * user-varying, hence `Cache-Control: private, no-cache` on the API side.
 */
export interface GameDetailResponse extends GameDetailWire {
  backlogEntry: BacklogEntryWire | null;
}

/** `GET /api/backlog` */
export interface BacklogListResponse {
  items: BacklogListItemWire[];
}

/** `GET /api/backlog/stats` */
export interface BacklogStatsWire {
  total: number;
  counts: Record<BacklogStatus, number>;
  averageRating: number | null;
}

/**
 * RFC 9457, as the API actually renders it — which differs from the API design
 * document's §11 in two ways recorded in its own §16: validation issues are
 * `{field, message}` with a dot-joined path, and a 422 carries
 * `type: "about:blank"` with no `instance` or `traceId` in the body (the
 * correlation id travels in the `X-Request-Id` header).
 *
 * A 5xx never carries `detail`, deliberately: exception messages leak schema
 * names and file paths. Error copy for 5xx must not depend on one.
 */
export interface ProblemDocument {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  errors?: { field: string; message: string }[];
}
```

- [ ] **Step 2: Export it**

Modify `packages/contracts/src/index.ts` — add the line in alphabetical order with the others:

```ts
export * from "./backlog.js";
export * from "./coerce.js";
export * from "./games.js";
export * from "./wire.js";
```

- [ ] **Step 3: Build contracts and confirm the types resolve**

Run: `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts check-types`
Expected: both succeed, `packages/contracts/dist/wire.d.ts` exists.

- [ ] **Step 4: Point `apps/api` at the shared types**

In `apps/api/src/serialize.ts`, delete the four local `interface` declarations
(`GameSummaryWire`, `GameDetailWire`, `BacklogEntryWire`, `BacklogListItemWire`)
and replace the import block at the top of the file with:

```ts
import type {
  BacklogEntryWire,
  BacklogListItemWire,
  GameDetailWire,
  GameSummaryWire,
} from "@repo/contracts";
import type { BacklogEntry, BacklogListItem, GameDetail, GameSummary } from "@repo/db";

export type {
  BacklogEntryWire,
  BacklogListItemWire,
  GameDetailWire,
  GameSummaryWire,
} from "@repo/contracts";
```

The re-export is what keeps `apps/api/src/routes/*.ts` compiling unchanged —
`games.ts` imports `GameSummaryWire` from `../serialize.js` today.

`NamedRef`, `PlatformRef` and `BacklogStatusValue` are no longer imported from
`@repo/db` in this file; the mapping functions below keep their `@repo/db`
row-type parameters exactly as they are. Structural typing reconciles
`@repo/db`'s `NamedRef` with the contracts one.

- [ ] **Step 5: Verify nothing regressed**

Run: `pnpm check-types && pnpm lint`
Expected: PASS across all packages.

Run: `pnpm --filter api test`
Expected: PASS, same count as before (the API test suite is the real assertion
that the lifted types are structurally identical).

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/wire.ts packages/contracts/src/index.ts apps/api/src/serialize.ts
git commit -m "feat(contracts): declare the HTTP wire contract once

The four *Wire interfaces move out of apps/api/src/serialize.ts so the Expo app
can import them without pulling a Node dependency into the bundle, and the
response envelopes (GameDetailResponse and friends) get named for the first
time — the routes built them inline. serialize.ts re-exports them, so every
importer in apps/api compiles unchanged and a drifting serializer now fails the
API's own typecheck."
```

---

## Task 2: Mobile dependencies, native config and Vitest

**Files:**

- Modify: `apps/mobile/package.json`, `apps/mobile/app.json`, `apps/mobile/.env.example`, `turbo.json`
- Create: `apps/mobile/vitest.config.ts`, `apps/mobile/test/smoke.test.ts`

**Interfaces:**

- Produces: a working `pnpm --filter mobile test` command; `@repo/contracts` importable from mobile source

- [ ] **Step 1: Install the dependencies**

From `apps/mobile`:

```bash
npx expo install @clerk/expo expo-secure-store expo-image expo-linear-gradient
npx expo install @tanstack/react-query
```

Then from the repo root:

```bash
pnpm --filter mobile add -D vitest
pnpm --filter mobile add @repo/contracts@workspace:*
```

Do **not** install `expo-apple-authentication`, `expo-crypto`,
`expo-web-browser` or `expo-auth-session`. `@clerk/expo` declares them as
_optional_ peers and they are only needed for a hand-rolled sign-in UI;
`<AuthView />` runs the Apple flow internally. Installing them puts four unused
native modules in the build.

- [ ] **Step 2: Register the config plugins**

In `apps/mobile/app.json`, replace the `plugins` array with:

```json
"plugins": [
  "expo-router",
  [
    "expo-splash-screen",
    {
      "backgroundColor": "#208AEF",
      "image": "./assets/images/splash-icon.png",
      "imageWidth": 76
    }
  ],
  "expo-secure-store",
  "@clerk/expo"
]
```

`@clerk/expo` takes no options: `appleSignIn` defaults to `true`, which is what
we want, and it adds the `com.apple.developer.applesignin` entitlement.

- [ ] **Step 3: Declare the environment**

Append to `apps/mobile/.env.example`:

```
# Clerk — https://dashboard.clerk.com, API keys. Must be the SAME instance as
# apps/api's CLERK_SECRET_KEY, or every request is a 401.
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
```

In `turbo.json`, add `"EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"` to the `env` array of
**both** the `build` task and the `dev` task, immediately after
`"EXPO_PUBLIC_API_URL"`.

- [ ] **Step 4: Configure Vitest**

`apps/mobile/vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure unit tests in plain Node: no React Native transform, no jsdom.
    // @expo/ui components are native views that render to nothing meaningful
    // off-device, so anything under test must stay free of react-native and
    // @expo/ui imports.
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    // Mirrors the `@/*` path in tsconfig.json so tests and source agree.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

Add to `apps/mobile/package.json` scripts, after `"start"`:

```json
"test": "vitest run",
```

- [ ] **Step 5: Write a smoke test proving the runner and the alias work**

`apps/mobile/test/smoke.test.ts`:

```ts
import { BACKLOG_STATUSES } from "@repo/contracts";
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("resolves @repo/contracts from the mobile package", () => {
    expect(BACKLOG_STATUSES).toEqual(["waiting", "playing", "completed", "abandoned"]);
  });
});
```

Tests import from `vitest` explicitly rather than relying on globals, so the
existing `expoAppConfig` ESLint config needs no changes.

- [ ] **Step 6: Run it**

Run: `pnpm --filter mobile test`
Expected: PASS, 1 test.

- [ ] **Step 7: Build the native app**

Run: `pnpm --filter mobile prebuild && pnpm --filter mobile ios`
Expected: the build succeeds and the app launches showing the existing
placeholder screens. If code signing fails on the `applesignin` entitlement,
Task 0 step 1 is incomplete.

- [ ] **Step 8: Verify and commit**

Run: `pnpm lint && pnpm check-types && pnpm test`
Expected: PASS.

```bash
git add apps/mobile/package.json apps/mobile/app.json apps/mobile/.env.example \
        apps/mobile/vitest.config.ts apps/mobile/test/smoke.test.ts turbo.json pnpm-lock.yaml
git commit -m "chore(mobile): add Clerk, TanStack Query, expo-image and Vitest

The @clerk/expo config plugin adds the Apple Sign In entitlement, so this needs
a prebuild rather than a reload. Clerk's optional peers (expo-apple-
authentication, expo-crypto, expo-web-browser, expo-auth-session) are
deliberately absent: AuthView runs the Apple flow itself and they are only
needed for a hand-rolled sign-in UI.

Vitest runs in plain Node with no React Native transform, which is why anything
under test must avoid react-native and @expo/ui imports."
```

---

## Task 3: IGDB image URLs

**Files:**

- Create: `apps/mobile/src/igdb-image.ts`
- Test: `apps/mobile/test/igdb-image.test.ts`

**Interfaces:**

- Produces: `coverUrl(imageId: string | null, size: CoverSize): string | null`, `screenshotUrl(imageId: string): string`, `type CoverSize = "small" | "big"`

- [ ] **Step 1: Write the failing test**

`apps/mobile/test/igdb-image.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { coverUrl, screenshotUrl } from "@/igdb-image";

describe("coverUrl", () => {
  it("builds a small cover URL for list rows", () => {
    expect(coverUrl("co4jni", "small")).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_small_2x/co4jni.jpg",
    );
  });

  it("builds a big cover URL for the detail hero", () => {
    expect(coverUrl("co4jni", "big")).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co4jni.jpg",
    );
  });

  it("returns null for a game with no cover, so callers render a placeholder", () => {
    expect(coverUrl(null, "small")).toBeNull();
  });
});

describe("screenshotUrl", () => {
  it("builds a medium screenshot URL", () => {
    expect(screenshotUrl("sc8xyz")).toBe(
      "https://images.igdb.com/igdb/image/upload/t_screenshot_med_2x/sc8xyz.jpg",
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter mobile test igdb-image`
Expected: FAIL — cannot resolve `@/igdb-image`.

- [ ] **Step 3: Implement**

`apps/mobile/src/igdb-image.ts`:

```ts
/**
 * IGDB serves images from a Cloudinary-style path where the `t_` segment names
 * a named transform. `_2x` is the retina variant, which is what every iPhone
 * needs — requesting the 1x asset and letting the device upscale is the single
 * most visible way to make cover art look cheap.
 *
 * Sizes are chosen per call site rather than exposed freely, so a list row can
 * never accidentally download a hero-sized image.
 */
const BASE = "https://images.igdb.com/igdb/image/upload";

export type CoverSize = "small" | "big";

const COVER_TRANSFORMS: Record<CoverSize, string> = {
  small: "t_cover_small_2x",
  big: "t_cover_big_2x",
};

/** `null` when the game has no mirrored cover — the caller renders a symbol. */
export function coverUrl(imageId: string | null, size: CoverSize): string | null {
  if (imageId === null) return null;

  return `${BASE}/${COVER_TRANSFORMS[size]}/${imageId}.jpg`;
}

export function screenshotUrl(imageId: string): string {
  return `${BASE}/t_screenshot_med_2x/${imageId}.jpg`;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter mobile test igdb-image`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/igdb-image.ts apps/mobile/test/igdb-image.test.ts
git commit -m "feat(mobile): build IGDB image URLs

Sizes are named per call site rather than free-form so a list row cannot
download a hero-sized cover. All variants are _2x: requesting 1x and letting
the device upscale is the most visible way to make cover art look cheap."
```

---

## Task 4: iOS 26 button style resolution

**Files:**

- Create: `apps/mobile/src/ui/glass.ts`, `apps/mobile/src/ui/platform-glass.ts`
- Test: `apps/mobile/test/glass.test.ts`

**Interfaces:**

- Produces: `glassButtonStyle(iosMajorVersion: number, prominent: boolean): "glass" | "glassProminent" | "bordered" | "borderedProminent"` from `@/ui/glass`; `GLASS_STYLE`, `GLASS_PROMINENT_STYLE` constants from `@/ui/platform-glass`

- [ ] **Step 1: Write the failing test**

`apps/mobile/test/glass.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { glassButtonStyle } from "@/ui/glass";

describe("glassButtonStyle", () => {
  it("uses Liquid Glass on iOS 26", () => {
    expect(glassButtonStyle(26, false)).toBe("glass");
    expect(glassButtonStyle(26, true)).toBe("glassProminent");
  });

  it("uses Liquid Glass on iOS above 26", () => {
    expect(glassButtonStyle(27, true)).toBe("glassProminent");
  });

  it("falls back to bordered styles below iOS 26", () => {
    expect(glassButtonStyle(18, false)).toBe("bordered");
    expect(glassButtonStyle(18, true)).toBe("borderedProminent");
  });

  it("falls back rather than throwing when the version cannot be parsed", () => {
    expect(glassButtonStyle(Number.NaN, true)).toBe("borderedProminent");
  });
});
```

The NaN case matters: `Platform.Version` is a string and
`Number.parseInt` returns `NaN` on anything unexpected. A naive `>= 26`
comparison against NaN is `false`, which happens to be the safe answer — this
test pins that so a later refactor to `!(v < 26)` is caught.

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter mobile test glass`
Expected: FAIL — cannot resolve `@/ui/glass`.

- [ ] **Step 3: Implement the pure resolver**

`apps/mobile/src/ui/glass.ts`:

```ts
/**
 * `buttonStyle('glass')` and `'glassProminent'` are iOS 26+ only. Passing them
 * on iOS 18 does not degrade gracefully — the button renders with no style at
 * all — so every call site resolves through here.
 *
 * The version is a parameter rather than read from `Platform.Version` inside
 * this function, so the module stays importable by Vitest (see the Global
 * Constraints: no react-native imports in tested modules).
 */
export type ButtonStyleName = "glass" | "glassProminent" | "bordered" | "borderedProminent";

export function glassButtonStyle(iosMajorVersion: number, prominent: boolean): ButtonStyleName {
  if (iosMajorVersion >= 26) return prominent ? "glassProminent" : "glass";

  return prominent ? "borderedProminent" : "bordered";
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter mobile test glass`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the untested platform reader**

`apps/mobile/src/ui/platform-glass.ts`:

```ts
import { Platform } from "react-native";

import { glassButtonStyle } from "./glass";

/**
 * Resolved once at module load: the OS version cannot change while the app is
 * running. Kept apart from `glass.ts` because importing `react-native` would
 * make that module untestable in Node.
 */
const IOS_MAJOR = Number.parseInt(String(Platform.Version), 10);

export const GLASS_STYLE = glassButtonStyle(IOS_MAJOR, false);
export const GLASS_PROMINENT_STYLE = glassButtonStyle(IOS_MAJOR, true);
```

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm --filter mobile test`
Expected: PASS.

```bash
git add apps/mobile/src/ui/glass.ts apps/mobile/src/ui/platform-glass.ts apps/mobile/test/glass.test.ts
git commit -m "feat(mobile): resolve Liquid Glass button styles by iOS version

glass/glassProminent are iOS 26+ and do not degrade — on iOS 18 the button
renders with no style at all. The resolver takes the version as a parameter so
it stays importable by Vitest; a one-line sibling reads Platform.Version."
```

---

## Task 5: `ApiError` and problem-document parsing

**Files:**

- Create: `apps/mobile/src/api/errors.ts`
- Test: `apps/mobile/test/api-errors.test.ts`

**Interfaces:**

- Consumes: `ProblemDocument` from `@repo/contracts` (Task 1)
- Produces: `class ApiError` with fields `status, type, title, detail?, traceId?, errors?, retryAfter?`; `toApiError(response: Response, body: unknown, retryAfter?: number): ApiError`; `isApiError(error: unknown): error is ApiError`

- [ ] **Step 1: Write the failing test**

`apps/mobile/test/api-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ApiError, isApiError, toApiError } from "@/api/errors";

const response = (status: number, statusText = ""): Response =>
  new Response(null, { status, statusText });

describe("toApiError", () => {
  it("reads every member of a problem document", () => {
    const error = toApiError(response(404), {
      type: "https://barklog.gg/problems/not-found",
      title: "Not Found",
      status: 404,
      detail: "Game 999 is not in the mirror.",
      instance: "/api/games/999",
      traceId: "01JQ8F3K2M9X7YB4NDVWZP6HRC",
    });

    expect(error.status).toBe(404);
    expect(error.type).toBe("https://barklog.gg/problems/not-found");
    expect(error.title).toBe("Not Found");
    expect(error.detail).toBe("Game 999 is not in the mirror.");
    expect(error.traceId).toBe("01JQ8F3K2M9X7YB4NDVWZP6HRC");
  });

  it("keeps the validation issues from a 422", () => {
    const error = toApiError(response(422), {
      type: "about:blank",
      title: "Unprocessable Content",
      status: 422,
      errors: [{ field: "q", message: "Invalid length: Expected >=2 but received 1" }],
    });

    expect(error.errors).toEqual([
      { field: "q", message: "Invalid length: Expected >=2 but received 1" },
    ]);
  });

  it("carries retryAfter on a 429", () => {
    expect(
      toApiError(response(429), { title: "Too Many Requests", status: 429 }, 30).retryAfter,
    ).toBe(30);
  });

  it("synthesises an error when the body is not a problem document", () => {
    const error = toApiError(response(502, "Bad Gateway"), "<html>nginx</html>");

    expect(error.status).toBe(502);
    expect(error.title).toBe("Bad Gateway");
    expect(error.detail).toBeUndefined();
    expect(error.type).toBe("about:blank");
  });

  it("synthesises an error when there is no body at all", () => {
    const error = toApiError(response(500), null);

    expect(error.status).toBe(500);
    expect(error.title).toBe("Request failed");
  });

  it("prefers the response status over a mismatched body status", () => {
    // A proxy rewriting the status must not be able to make the app think a
    // failure was something else.
    expect(toApiError(response(503), { title: "Nope", status: 200 }).status).toBe(503);
  });

  it("produces a message useful in a log line", () => {
    expect(
      toApiError(response(404), { title: "Not Found", status: 404, detail: "No such game." })
        .message,
    ).toBe("404 Not Found: No such game.");
  });
});

describe("isApiError", () => {
  it("recognises an ApiError", () => {
    expect(isApiError(toApiError(response(404), null))).toBe(true);
  });

  it("rejects a plain Error", () => {
    expect(isApiError(new Error("boom"))).toBe(false);
  });

  it("rejects a non-error", () => {
    expect(isApiError("boom")).toBe(false);
  });
});

describe("ApiError", () => {
  it("is an Error, so it flows through TanStack Query unchanged", () => {
    expect(toApiError(response(404), null)).toBeInstanceOf(Error);
    expect(toApiError(response(404), null)).toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter mobile test api-errors`
Expected: FAIL — cannot resolve `@/api/errors`.

- [ ] **Step 3: Implement**

`apps/mobile/src/api/errors.ts`:

```ts
import type { ProblemDocument } from "@repo/contracts";

/**
 * Every non-2xx from the API becomes one of these. The API guarantees
 * `application/problem+json` on every error it produces itself, but a failure
 * upstream of it — a proxy 502, a captive portal — will not be one, so parsing
 * must degrade to the status line rather than throwing a JSON error where an
 * HTTP error happened.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail?: string;
  readonly traceId?: string;
  readonly errors?: { field: string; message: string }[];
  /** Seconds, from `Retry-After`. Present on a 429. */
  readonly retryAfter?: number;

  constructor(fields: {
    status: number;
    type: string;
    title: string;
    detail?: string;
    traceId?: string;
    errors?: { field: string; message: string }[];
    retryAfter?: number;
  }) {
    super(
      fields.detail === undefined
        ? `${fields.status} ${fields.title}`
        : `${fields.status} ${fields.title}: ${fields.detail}`,
    );

    this.name = "ApiError";
    this.status = fields.status;
    this.type = fields.type;
    this.title = fields.title;
    this.detail = fields.detail;
    this.traceId = fields.traceId;
    this.errors = fields.errors;
    this.retryAfter = fields.retryAfter;
  }
}

function isProblemDocument(body: unknown): body is Partial<ProblemDocument> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

/**
 * `response.status` always wins over the body's `status` member. A proxy
 * rewriting one must not be able to make the app believe a failure was
 * something else — and the two disagreeing is itself a sign of a body that
 * cannot be trusted.
 */
export function toApiError(response: Response, body: unknown, retryAfter?: number): ApiError {
  const problem = isProblemDocument(body) ? body : undefined;

  return new ApiError({
    status: response.status,
    type: typeof problem?.type === "string" ? problem.type : "about:blank",
    title:
      typeof problem?.title === "string" ? problem.title : response.statusText || "Request failed",
    detail: typeof problem?.detail === "string" ? problem.detail : undefined,
    traceId: typeof problem?.traceId === "string" ? problem.traceId : undefined,
    errors: Array.isArray(problem?.errors) ? problem.errors : undefined,
    retryAfter,
  });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter mobile test api-errors`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/api/errors.ts apps/mobile/test/api-errors.test.ts
git commit -m "feat(mobile): parse RFC 9457 problem documents into ApiError

Degrades to the status line when the body is not a problem document, so a proxy
502 never surfaces as a JSON parse failure. The response status always beats the
body's status member: the two disagreeing is itself a sign the body cannot be
trusted."
```

---

## Task 6: The fetch client

**Files:**

- Create: `apps/mobile/src/api/client.ts`
- Test: `apps/mobile/test/api-client.test.ts`

**Interfaces:**

- Consumes: `toApiError`, `ApiError` from `@/api/errors` (Task 5)
- Produces:

```ts
export interface RequestOptions {
  method?: "GET" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}
export type Request = <T>(path: string, options?: RequestOptions) => Promise<T>;
export interface ApiClientDeps {
  baseUrl: string;
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
  fetchImpl?: typeof fetch;
}
export function createRequest(deps: ApiClientDeps): Request;
```

- [ ] **Step 1: Write the failing test**

`apps/mobile/test/api-client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRequest } from "@/api/client";
import { isApiError } from "@/api/errors";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const problem = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/problem+json", ...headers },
  });

let calls: { url: string; init: RequestInit }[];
let getToken: ReturnType<typeof vi.fn>;

function client(responses: Response[]) {
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url: string | URL | globalThis.Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra fetch call");
    return next;
  }) as unknown as typeof fetch;

  return createRequest({ baseUrl: "http://api.test", getToken, fetchImpl });
}

beforeEach(() => {
  calls = [];
  getToken = vi.fn(async () => "tok_abc");
});

describe("createRequest — request shape", () => {
  it("joins the path onto the base URL", async () => {
    await client([json({ items: [] })])("/api/backlog");

    expect(calls[0]?.url).toBe("http://api.test/api/backlog");
  });

  it("tolerates a base URL with a trailing slash", async () => {
    const request = createRequest({
      baseUrl: "http://api.test/",
      getToken,
      fetchImpl: (async () => json({ ok: true })) as unknown as typeof fetch,
    });

    await expect(request("/api/backlog")).resolves.toEqual({ ok: true });
  });

  it("sends the Clerk token as a bearer credential", async () => {
    await client([json({ items: [] })])("/api/backlog");

    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok_abc");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("omits Content-Type when there is no body", async () => {
    await client([json({ items: [] })])("/api/backlog");

    expect(new Headers(calls[0]?.init.headers).get("Content-Type")).toBeNull();
  });

  it("sets Content-Type and serialises the body on a PUT", async () => {
    await client([json({ gameId: 1 })])("/api/backlog/1", {
      method: "PUT",
      body: { status: "playing", rating: 8 },
    });

    expect(new Headers(calls[0]?.init.headers).get("Content-Type")).toBe("application/json");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ status: "playing", rating: 8 }));
    expect(calls[0]?.init.method).toBe("PUT");
  });

  it("builds a query string and drops undefined parameters", async () => {
    await client([json({ items: [] })])("/api/games/search", {
      query: { q: "dark souls", limit: 20, offset: undefined },
    });

    expect(calls[0]?.url).toBe("http://api.test/api/games/search?q=dark+souls&limit=20");
  });

  it("throws without calling fetch when there is no token", async () => {
    getToken = vi.fn(async () => null);

    await expect(client([])("/api/backlog")).rejects.toThrow(/not signed in/i);
    expect(calls).toHaveLength(0);
  });
});

describe("createRequest — responses", () => {
  it("parses a JSON body", async () => {
    await expect(client([json({ items: [{ id: 1 }] })])("/api/backlog")).resolves.toEqual({
      items: [{ id: 1 }],
    });
  });

  it("returns undefined for a 204", async () => {
    await expect(
      client([new Response(null, { status: 204 })])("/api/backlog/1", { method: "DELETE" }),
    ).resolves.toBeUndefined();
  });

  it("refetches once with cache: reload on a bare 304", async () => {
    const result = await client([
      new Response(null, { status: 304 }),
      json({ items: [{ id: 7 }] }),
    ])("/api/backlog");

    expect(result).toEqual({ items: [{ id: 7 }] });
    expect(calls).toHaveLength(2);
    expect((calls[1]?.init as { cache?: string }).cache).toBe("reload");
  });

  it("throws if the 304 repeats after the reload", async () => {
    await expect(
      client([new Response(null, { status: 304 }), new Response(null, { status: 304 })])(
        "/api/backlog",
      ),
    ).rejects.toThrow(/not modified/i);
  });
});

describe("createRequest — errors", () => {
  it("throws an ApiError built from the problem document", async () => {
    const error = await client([
      problem(404, { type: "x/not-found", title: "Not Found", status: 404, detail: "nope" }),
    ])("/api/games/999").catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    expect(isApiError(error) && error.status).toBe(404);
    expect(isApiError(error) && error.detail).toBe("nope");
  });

  it("reads Retry-After into the error on a 429", async () => {
    const error = await client([
      problem(429, { title: "Too Many Requests", status: 429 }, { "Retry-After": "42" }),
    ])("/api/games/search").catch((e: unknown) => e);

    expect(isApiError(error) && error.retryAfter).toBe(42);
  });

  it("survives an error body that is not JSON", async () => {
    const error = await client([
      new Response("<html>502</html>", { status: 502, statusText: "Bad Gateway" }),
    ])("/api/backlog").catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(502);
    expect(isApiError(error) && error.title).toBe("Bad Gateway");
  });

  it("retries a 401 exactly once with a fresh token, then succeeds", async () => {
    const result = await client([
      problem(401, { title: "Unauthorized", status: 401 }),
      json({ items: [] }),
    ])("/api/backlog");

    expect(result).toEqual({ items: [] });
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
  });

  it("gives up after one 401 retry rather than looping", async () => {
    const error = await client([
      problem(401, { title: "Unauthorized", status: 401 }),
      problem(401, { title: "Unauthorized", status: 401 }),
    ])("/api/backlog").catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(401);
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("wraps a network failure so callers only ever catch an ApiError", async () => {
    const request = createRequest({
      baseUrl: "http://api.test",
      getToken,
      fetchImpl: (async () => {
        throw new TypeError("Network request failed");
      }) as unknown as typeof fetch,
    });

    const error = await request("/api/backlog").catch((e: unknown) => e);

    expect(isApiError(error) && error.status).toBe(0);
    expect(isApiError(error) && error.title).toMatch(/offline|network/i);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter mobile test api-client`
Expected: FAIL — cannot resolve `@/api/client`.

- [ ] **Step 3: Implement**

`apps/mobile/src/api/client.ts`:

```ts
import { ApiError, toApiError } from "./errors";

export interface RequestOptions {
  method?: "GET" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export type Request = <T>(path: string, options?: RequestOptions) => Promise<T>;

export interface ApiClientDeps {
  baseUrl: string;
  /** Clerk's `getToken`. `skipCache` forces a refresh. */
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
  /** Injected in tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

function buildUrl(baseUrl: string, path: string, query: RequestOptions["query"]): string {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  if (!query) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }

  const serialised = search.toString();
  return serialised === "" ? url : `${url}?${serialised}`;
}

/**
 * The transport layer. No React, so its branching is unit-testable in Node —
 * and this is the layer most likely to be wrong.
 */
export function createRequest(deps: ApiClientDeps): Request {
  const doFetch = deps.fetchImpl ?? fetch;

  async function send(
    path: string,
    options: RequestOptions,
    { skipTokenCache = false, reload = false } = {},
  ): Promise<Response> {
    const token = await deps.getToken(skipTokenCache ? { skipCache: true } : undefined);
    if (token === null) {
      throw new ApiError({
        status: 401,
        type: "about:blank",
        title: "Not signed in",
        detail: "No session token is available.",
      });
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };
    // Only when there is a body: a DELETE carries none, and sending a
    // Content-Type on it would make the API's requireJson middleware reject it.
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    const url = buildUrl(deps.baseUrl, path, options.query);

    try {
      return await doFetch(url, {
        method: options.method ?? "GET",
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        ...(reload ? { cache: "reload" as RequestCache } : {}),
      });
    } catch (cause) {
      // A DNS failure, a dropped connection, ATS refusing plain HTTP. Wrapped
      // so every caller catches exactly one error type.
      throw new ApiError({
        status: 0,
        type: "about:blank",
        title: "Network unavailable",
        detail: "Barklog could not reach the server. Check your connection.",
      });
    }
  }

  async function parse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;

    if (!response.ok) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfter =
        retryAfterHeader === null ? undefined : Number.parseInt(retryAfterHeader, 10);

      throw toApiError(
        response,
        await response.json().catch(() => null),
        Number.isNaN(retryAfter) ? undefined : retryAfter,
      );
    }

    return (await response.json()) as T;
  }

  return async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let response = await send(path, options);

    // `GET /api/backlog` is ETag'd, and NSURLSession performs the
    // If-None-Match revalidation itself, handing us a transparent 200 with the
    // stored body — a bare 304 normally never arrives here. If one does, ask
    // for the body rather than parsing an empty one. Deliberately NOT solved by
    // threading TanStack's cached value in: that would reimplement, in JS,
    // revalidation the URL loading system already does correctly.
    if (response.status === 304) {
      response = await send(path, options, { reload: true });

      if (response.status === 304) {
        throw new ApiError({
          status: 304,
          type: "about:blank",
          title: "Not modified",
          detail: "The server returned 304 for a request that asked for a fresh copy.",
        });
      }
    }

    // Clerk refreshes proactively, so a 401 here means a revoked session rather
    // than an expired token. One retry with a forced refresh, then give up —
    // retrying past that is a loop.
    if (response.status === 401) {
      response = await send(path, options, { skipTokenCache: true });
    }

    return parse<T>(response);
  };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter mobile test api-client`
Expected: PASS, 17 tests.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm --filter mobile test`
Expected: PASS.

```bash
git add apps/mobile/src/api/client.ts apps/mobile/test/api-client.test.ts
git commit -m "feat(mobile): typed fetch transport over the Barklog API

Injectable fetch and getToken, so every branch — 204, bare 304, 401 retry, 429
Retry-After, non-JSON error body, network failure — is tested in Node with no
simulator. Content-Type is set only when a body exists: a DELETE carries none,
and sending one would trip the API's requireJson middleware."
```

---

## Task 7: Endpoints and query keys

**Files:**

- Create: `apps/mobile/src/api/endpoints.ts`, `apps/mobile/src/api/keys.ts`
- Test: `apps/mobile/test/api-endpoints.test.ts`, `apps/mobile/test/api-keys.test.ts`

**Interfaces:**

- Consumes: `createRequest`, `Request` from `@/api/client`; wire types from `@repo/contracts`
- Produces:

```ts
export function createEndpoints(request: Request): Endpoints;
export interface Endpoints {
  searchGames(input: { q: string; limit?: number; offset?: number }): Promise<GameListResponse>;
  popularGames(input?: { limit?: number }): Promise<GameListResponse>;
  getGame(id: number): Promise<GameDetailResponse>;
  listBacklog(input?: { status?: BacklogStatus; sort?: BacklogSort }): Promise<BacklogListResponse>;
  getBacklogStats(): Promise<BacklogStatsWire>;
  upsertBacklogEntry(gameId: number, input: { status: BacklogStatus; rating: number | null }): Promise<BacklogEntryWire>;
  deleteBacklogEntry(gameId: number): Promise<void>;
}
export const keys: { … }   // see Step 5
```

- [ ] **Step 1: Write the failing endpoints test**

`apps/mobile/test/api-endpoints.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createEndpoints } from "@/api/endpoints";
import type { Request } from "@/api/client";

function spy() {
  const calls: { path: string; options: unknown }[] = [];
  const request = vi.fn(async (path: string, options?: unknown) => {
    calls.push({ path, options: options ?? {} });
    return {} as never;
  }) as unknown as Request;

  return { request, calls };
}

describe("createEndpoints", () => {
  it("searches games", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).searchGames({ q: "zelda", limit: 20, offset: 0 });

    expect(calls[0]).toEqual({
      path: "/api/games/search",
      options: { query: { q: "zelda", limit: 20, offset: 0 } },
    });
  });

  it("requests the popular feed with a default limit", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).popularGames();

    expect(calls[0]).toEqual({ path: "/api/games/popular", options: { query: { limit: 20 } } });
  });

  it("fetches one game by id", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).getGame(1942);

    expect(calls[0]).toEqual({ path: "/api/games/1942", options: {} });
  });

  it("lists the backlog with the default sort and no status filter", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).listBacklog();

    expect(calls[0]).toEqual({
      path: "/api/backlog",
      options: { query: { status: undefined, sort: "updated_at" } },
    });
  });

  it("lists the backlog filtered by status", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).listBacklog({ status: "playing" });

    expect(calls[0]).toEqual({
      path: "/api/backlog",
      options: { query: { status: "playing", sort: "updated_at" } },
    });
  });

  it("fetches stats", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).getBacklogStats();

    expect(calls[0]).toEqual({ path: "/api/backlog/stats", options: {} });
  });

  it("upserts an entry with PUT", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).upsertBacklogEntry(1942, { status: "completed", rating: 9 });

    expect(calls[0]).toEqual({
      path: "/api/backlog/1942",
      options: { method: "PUT", body: { status: "completed", rating: 9 } },
    });
  });

  it("sends rating: null when a rating is cleared", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).upsertBacklogEntry(1942, { status: "waiting", rating: null });

    expect(calls[0]).toEqual({
      path: "/api/backlog/1942",
      options: { method: "PUT", body: { status: "waiting", rating: null } },
    });
  });

  it("deletes an entry", async () => {
    const { request, calls } = spy();
    await createEndpoints(request).deleteBacklogEntry(1942);

    expect(calls[0]).toEqual({ path: "/api/backlog/1942", options: { method: "DELETE" } });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter mobile test api-endpoints`
Expected: FAIL — cannot resolve `@/api/endpoints`.

- [ ] **Step 3: Implement the endpoints**

`apps/mobile/src/api/endpoints.ts`:

```ts
import {
  SEARCH_LIMIT_DEFAULT,
  type BacklogEntryWire,
  type BacklogListResponse,
  type BacklogSort,
  type BacklogStatsWire,
  type BacklogStatus,
  type GameDetailResponse,
  type GameListResponse,
} from "@repo/contracts";

import type { Request } from "./client";

/** One function per route in the API design's §8. */
export function createEndpoints(request: Request) {
  return {
    searchGames: (input: { q: string; limit?: number; offset?: number }) =>
      request<GameListResponse>("/api/games/search", {
        query: {
          q: input.q,
          limit: input.limit ?? SEARCH_LIMIT_DEFAULT,
          offset: input.offset ?? 0,
        },
      }),

    popularGames: (input: { limit?: number } = {}) =>
      request<GameListResponse>("/api/games/popular", {
        query: { limit: input.limit ?? SEARCH_LIMIT_DEFAULT },
      }),

    getGame: (id: number) => request<GameDetailResponse>(`/api/games/${id}`),

    listBacklog: (input: { status?: BacklogStatus; sort?: BacklogSort } = {}) =>
      request<BacklogListResponse>("/api/backlog", {
        // `undefined` is dropped by the query builder, which is how "All"
        // becomes an unfiltered request rather than `?status=`.
        query: { status: input.status, sort: input.sort ?? "updated_at" },
      }),

    getBacklogStats: () => request<BacklogStatsWire>("/api/backlog/stats"),

    upsertBacklogEntry: (gameId: number, input: { status: BacklogStatus; rating: number | null }) =>
      request<BacklogEntryWire>(`/api/backlog/${gameId}`, {
        method: "PUT",
        body: { status: input.status, rating: input.rating },
      }),

    deleteBacklogEntry: (gameId: number) =>
      request<void>(`/api/backlog/${gameId}`, { method: "DELETE" }),
  };
}

export type Endpoints = ReturnType<typeof createEndpoints>;
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter mobile test api-endpoints`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the failing keys test**

`apps/mobile/test/api-keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { keys } from "@/api/keys";

describe("query keys", () => {
  it("namespaces games and backlog separately", () => {
    expect(keys.games.all).toEqual(["games"]);
    expect(keys.backlog.all).toEqual(["backlog"]);
  });

  it("keys a search by its full argument set", () => {
    expect(keys.games.search("zelda", 20, 0)).toEqual(["games", "search", "zelda", 20, 0]);
  });

  it("distinguishes searches that differ only by page", () => {
    expect(keys.games.search("zelda", 20, 0)).not.toEqual(keys.games.search("zelda", 20, 20));
  });

  it("keys a game detail by id", () => {
    expect(keys.games.detail(1942)).toEqual(["games", "detail", 1942]);
  });

  it("keys the backlog list by its filter, so All and a status differ", () => {
    expect(keys.backlog.list(undefined, "updated_at")).toEqual([
      "backlog",
      "list",
      "all",
      "updated_at",
    ]);
    expect(keys.backlog.list("playing", "updated_at")).toEqual([
      "backlog",
      "list",
      "playing",
      "updated_at",
    ]);
  });

  it("keys stats under the backlog namespace so one invalidation covers both", () => {
    expect(keys.backlog.stats()).toEqual(["backlog", "stats"]);
    expect(keys.backlog.stats()[0]).toBe(keys.backlog.all[0]);
  });

  it("is stable across calls", () => {
    expect(keys.games.detail(1)).toEqual(keys.games.detail(1));
  });
});
```

The stats assertion is doing real work: `invalidateQueries({ queryKey: keys.backlog.all })`
after a mutation must sweep both the list and the stats, and it only does so
because they share a first element.

- [ ] **Step 6: Run it and confirm it fails**

Run: `pnpm --filter mobile test api-keys`
Expected: FAIL — cannot resolve `@/api/keys`.

- [ ] **Step 7: Implement the keys**

`apps/mobile/src/api/keys.ts`:

```ts
import type { BacklogSort, BacklogStatus } from "@repo/contracts";

/**
 * Every cache key in one place, so none is spelled twice.
 *
 * `stats` sits under the `backlog` namespace deliberately: a mutation
 * invalidates `keys.backlog.all` and that must sweep the list *and* the counts,
 * which only works because they share a first element.
 *
 * The list key uses the literal `"all"` rather than `undefined` for the
 * unfiltered case — an `undefined` inside a key array is legal but reads as an
 * accident, and it makes the two cases indistinguishable in devtools.
 */
export const keys = {
  games: {
    all: ["games"] as const,
    search: (q: string, limit: number, offset: number) =>
      ["games", "search", q, limit, offset] as const,
    popular: (limit: number) => ["games", "popular", limit] as const,
    detail: (id: number) => ["games", "detail", id] as const,
  },
  backlog: {
    all: ["backlog"] as const,
    list: (status: BacklogStatus | undefined, sort: BacklogSort) =>
      ["backlog", "list", status ?? "all", sort] as const,
    stats: () => ["backlog", "stats"] as const,
  },
} as const;
```

- [ ] **Step 8: Run it and confirm it passes**

Run: `pnpm --filter mobile test api-keys`
Expected: PASS, 7 tests.

- [ ] **Step 9: Verify and commit**

Run: `pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm --filter mobile test`
Expected: PASS.

```bash
git add apps/mobile/src/api/endpoints.ts apps/mobile/src/api/keys.ts \
        apps/mobile/test/api-endpoints.test.ts apps/mobile/test/api-keys.test.ts
git commit -m "feat(mobile): endpoint functions and query key factory

Stats keys sit under the backlog namespace on purpose: a mutation invalidates
keys.backlog.all, and that only sweeps both the list and the counts because
they share a first element."
```

---

## Task 8: Sign-out cache clearing

**Files:**

- Create: `apps/mobile/src/auth/should-clear-cache.ts`
- Test: `apps/mobile/test/should-clear-cache.test.ts`

**Interfaces:**

- Produces: `shouldClearCache(previous: boolean | undefined, next: boolean): boolean`

- [ ] **Step 1: Write the failing test**

`apps/mobile/test/should-clear-cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { shouldClearCache } from "@/auth/should-clear-cache";

describe("shouldClearCache", () => {
  it("clears on sign-out", () => {
    expect(shouldClearCache(true, false)).toBe(true);
  });

  it("does not clear on first load when signed out", () => {
    // The critical case: clearing here would be harmless but the guard exists
    // so a cold start is never mistaken for a sign-out.
    expect(shouldClearCache(undefined, false)).toBe(false);
  });

  it("does not clear on first load when already signed in", () => {
    expect(shouldClearCache(undefined, true)).toBe(false);
  });

  it("does not clear on sign-in", () => {
    expect(shouldClearCache(false, true)).toBe(false);
  });

  it("does not clear on a repeat render in either state", () => {
    expect(shouldClearCache(true, true)).toBe(false);
    expect(shouldClearCache(false, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter mobile test should-clear-cache`
Expected: FAIL — cannot resolve `@/auth/should-clear-cache`.

- [ ] **Step 3: Implement**

`apps/mobile/src/auth/should-clear-cache.ts`:

```ts
/**
 * Whether a change in Clerk's `isSignedIn` means the query cache must be
 * emptied.
 *
 * This exists as a named function rather than an inline comparison inside the
 * effect because it guards the one auth path with a user-visible failure mode:
 * without it, the next person to sign in on a shared device sees the previous
 * user's backlog rendered from cache before the first refetch lands. A pure
 * function is testable; an inline comparison in a `useEffect` is not.
 */
export function shouldClearCache(previous: boolean | undefined, next: boolean): boolean {
  return previous === true && next === false;
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter mobile test should-clear-cache`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/auth/should-clear-cache.ts apps/mobile/test/should-clear-cache.test.ts
git commit -m "feat(mobile): predicate for clearing the query cache on sign-out

Guards the one auth path with a user-visible failure mode: without it the next
person to sign in on a shared device sees the previous user's backlog from
cache before the first refetch lands."
```

---

## Task 9: Clerk provider, auth gate and query client

**Files:**

- Create: `apps/mobile/src/query-client.ts`, `apps/mobile/src/api/provider.tsx`, `apps/mobile/src/auth/auth-gate.tsx`
- Modify: `apps/mobile/src/app/_layout.tsx`

**Interfaces:**

- Consumes: `createRequest` (Task 6), `createEndpoints` (Task 7), `shouldClearCache` (Task 8), `isApiError` (Task 5)
- Produces: `createQueryClient(): QueryClient`; `<ApiProvider>`; `useApi(): Endpoints`; `<AuthGate>`

- [ ] **Step 1: Create the query client factory**

`apps/mobile/src/query-client.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";

import { isApiError } from "@/api/errors";

/**
 * A 60 s `staleTime` is not just a network saving: it is what keeps
 * search-as-you-type under the API's 30 requests/minute search limit, because a
 * query the user has already typed comes back from cache for free.
 *
 * 4xx is never retried — a 404, a 422 or a 429 will not succeed on a second
 * attempt, and retrying a 429 makes the situation it reports worse.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;

          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}
```

- [ ] **Step 2: Create the API provider**

`apps/mobile/src/api/provider.tsx`:

```tsx
import { useAuth } from "@clerk/expo";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { createRequest } from "./client";
import { createEndpoints, type Endpoints } from "./endpoints";

const baseUrl = process.env.EXPO_PUBLIC_API_URL;

if (!baseUrl) {
  throw new Error("Add EXPO_PUBLIC_API_URL to apps/mobile/.env");
}

const ApiContext = createContext<Endpoints | null>(null);

/**
 * Binds the transport layer to Clerk's token getter. Mounted inside
 * `ClerkProvider` so `useAuth` has a provider, and outside `AuthGate` so the
 * endpoints exist before the first screen renders.
 */
export function ApiProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();

  const endpoints = useMemo(
    () => createEndpoints(createRequest({ baseUrl, getToken })),
    [getToken],
  );

  return <ApiContext.Provider value={endpoints}>{children}</ApiContext.Provider>;
}

export function useApi(): Endpoints {
  const endpoints = useContext(ApiContext);

  if (endpoints === null) throw new Error("useApi must be used inside <ApiProvider>");

  return endpoints;
}
```

- [ ] **Step 3: Create the auth gate**

`apps/mobile/src/auth/auth-gate.tsx`:

```tsx
import { useAuth } from "@clerk/expo";
import { AuthView } from "@clerk/expo/native";
import { useQueryClient } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, type ReactNode } from "react";

import { shouldClearCache } from "./should-clear-cache";

void SplashScreen.preventAutoHideAsync();

/**
 * The whole API is authenticated — only `/healthz` and `/readyz` are public —
 * so there is no anonymous state worth designing. `isDismissible={false}` is
 * what makes this a guard rather than a modal.
 *
 * `treatPendingAsSignedOut: false` stops a session mid-establishment being
 * misread as signed-out, and the three cases below are siblings at the same
 * level, which is Clerk's documented arrangement for keeping `AuthView` mounted
 * while sign-in completes.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const queryClient = useQueryClient();
  const previous = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;

    if (shouldClearCache(previous.current, isSignedIn)) queryClient.clear();
    previous.current = isSignedIn;
  }, [isLoaded, isSignedIn, queryClient]);

  useEffect(() => {
    // Held open until Clerk has read the keychain, so a returning user never
    // sees a flash of the sign-in screen.
    if (isLoaded) void SplashScreen.hideAsync();
  }, [isLoaded]);

  if (!isLoaded) return null;

  if (!isSignedIn) return <AuthView isDismissible={false} />;

  return children;
}
```

- [ ] **Step 4: Wire the root layout**

Replace `apps/mobile/src/app/_layout.tsx` entirely:

```tsx
import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { useColorScheme } from "react-native";

import { ApiProvider } from "@/api/provider";
import { AuthGate } from "@/auth/auth-gate";
import { createQueryClient } from "@/query-client";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

// Matches how apps/api refuses to boot on a missing secret rather than failing
// on the first request that needs it.
if (!publishableKey) {
  throw new Error("Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to apps/mobile/.env");
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // useState, not module scope: a client created at import time would be shared
  // across Fast Refresh reloads and outlive the tree it belongs to.
  const [queryClient] = useState(createQueryClient);

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            <AuthGate>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
              </Stack>
            </AuthGate>
            <StatusBar style="auto" />
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
```

- [ ] **Step 5: Run the app and sign in**

Run: `pnpm --filter mobile ios`

Expected, in order:

1. The splash screen holds, then the Clerk sign-in screen appears with no dismiss button.
2. **Sign in with Apple** works and lands on the placeholder tabs.
3. Killing and relaunching the app goes straight to the tabs with no flash of the sign-in screen.
4. Tapping the Profile tab still shows the old placeholder — the tab is removed in Task 10.

If sign-in succeeds but Apple is absent from the options, Task 0 steps 2–3 are incomplete.

- [ ] **Step 6: Confirm sign-out is reachable**

Open the Clerk profile UI (temporarily render `<UserButton />` on the Home
placeholder if needed) and confirm a sign-out control exists inside
`UserProfileView`. If it does not, note it — the fallback is a
`Stack.Toolbar.Menu` sign-out action added in Task 10. Remove any temporary
`UserButton` before committing.

- [ ] **Step 7: Verify and commit**

Run: `pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm --filter mobile test`
Expected: PASS.

```bash
git add apps/mobile/src/query-client.ts apps/mobile/src/api/provider.tsx \
        apps/mobile/src/auth/auth-gate.tsx apps/mobile/src/app/_layout.tsx
git commit -m "feat(mobile): guard the app with Clerk's native AuthView

The whole API is authenticated, so there is no anonymous state worth designing
and isDismissible={false} makes this a guard rather than a modal. The splash is
held until Clerk has read the keychain, so a returning user never sees a flash
of the sign-in screen.

The 60s staleTime on the query client is load-bearing rather than a nicety: it
is what keeps search-as-you-type under the API's 30/min search limit."
```

---

## Task 10: Navigation — tabs, per-tab stacks, headers

**Files:**

- Create: `apps/mobile/src/components/profile-toolbar.tsx`, `apps/mobile/src/app/(tabs)/(home)/_layout.tsx`, `apps/mobile/src/app/(tabs)/(home)/index.tsx`, `apps/mobile/src/app/(tabs)/(home)/game/[id].tsx`, `apps/mobile/src/app/(tabs)/explore/_layout.tsx`, `apps/mobile/src/app/(tabs)/explore/index.tsx`, `apps/mobile/src/app/(tabs)/explore/game/[id].tsx`, `apps/mobile/src/app/(tabs)/search/game/[id].tsx`
- Modify: `apps/mobile/src/app/(tabs)/_layout.tsx`, `apps/mobile/src/app/(tabs)/search/index.tsx`, `apps/mobile/src/theme.ts`
- Delete: `apps/mobile/src/app/(tabs)/profile.tsx`, `apps/mobile/src/app/(tabs)/index.tsx`, `apps/mobile/src/app/(tabs)/explore.tsx`

**Interfaces:**

- Produces: `<ProfileToolbar />`; the three `/game/[id]` routes; `Type` scale in `@/theme`

- [ ] **Step 1: Extend the theme**

Replace `apps/mobile/src/theme.ts`:

```ts
/**
 * Barklog's brand tint. Passed to `<Host seedColor>` so it propagates through
 * the SwiftUI environment and themes every native control underneath.
 *
 * This is the only hex literal in the app. Every React Native colour comes from
 * `PlatformColor`, so the RN half resolves the same iOS dynamic system colours
 * the SwiftUI half is already using, in both appearances, with no
 * `useColorScheme` branch to keep in step.
 */
export const Brand = {
  tint: "#208AEF",
} as const;

/** Matches the iOS text styles the SwiftUI controls beside these use. */
export const Type = {
  title2: { fontSize: 22, fontWeight: "700" },
  headline: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 17, fontWeight: "400" },
  subheadline: { fontSize: 15, fontWeight: "400" },
  footnote: { fontSize: 13, fontWeight: "400" },
} as const;

/** Cover aspect ratio. IGDB covers are 3:4 portrait, never square. */
export const COVER_ASPECT = 3 / 4;
```

- [ ] **Step 2: Create the profile toolbar**

`apps/mobile/src/components/profile-toolbar.tsx`:

```tsx
import { UserButton } from "@clerk/expo/native";
import { Stack } from "expo-router";

/**
 * The avatar in the top-right of every tab root, as Apple Music has it.
 *
 * `Stack.Toolbar.View` is the only slot that accepts an arbitrary React
 * component, and it must sit inside a `Stack.Toolbar` carrying the placement;
 * `Stack.Toolbar.Button` takes an SF Symbol name and so cannot host this.
 * `StackToolbarViewProps` has no `asChild` and no `placement` of its own —
 * `asChild` belongs to `Stack.Toolbar`, and is not needed here.
 *
 * `placement="right"` forces `headerShown: true`, which is what makes the large
 * title appear alongside it.
 *
 * `UserButton` opens Clerk's `UserProfileView` natively on tap — there is no
 * `onPress`, no modal state and no route to add.
 *
 * Deliberately not rendered on pushed screens: those get a back button and an
 * inline title, which is what every Apple app does.
 */
export function ProfileToolbar() {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.View>
        <UserButton />
      </Stack.Toolbar.View>
    </Stack.Toolbar>
  );
}
```

- [ ] **Step 3: Rewrite the tabs layout**

Replace `apps/mobile/src/app/(tabs)/_layout.tsx`:

```tsx
import { NativeTabs } from "expo-router/unstable-native-tabs";

const { Trigger } = NativeTabs;
const { Icon, Label } = Trigger;

/**
 * iOS native tab bar (UITabBarController). Home and Explore sit in the main
 * group; Search uses the `search` role so iOS 26 renders it apart from the
 * group and morphs it into the native search field.
 *
 * `(home)` is a route group, not a directory named `index`: a group adds no
 * path segment, so `(tabs)/(home)/index.tsx` still resolves to `/` while being
 * able to carry its own Stack for the large title and the profile avatar.
 */
export default function TabsLayout() {
  return (
    <NativeTabs minimizeBehavior="onScrollDown">
      <Trigger name="(home)">
        <Label>Home</Label>
        <Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </Trigger>

      <Trigger name="explore">
        <Label>Explore</Label>
        <Icon sf={{ default: "safari", selected: "safari.fill" }} md="explore" />
      </Trigger>

      <Trigger name="search" role="search">
        <Label>Search</Label>
      </Trigger>
    </NativeTabs>
  );
}
```

- [ ] **Step 4: Create the three per-tab stacks**

`apps/mobile/src/app/(tabs)/(home)/_layout.tsx`:

```tsx
import { Stack } from "expo-router";

export default function HomeLayout() {
  return <Stack />;
}
```

`apps/mobile/src/app/(tabs)/explore/_layout.tsx` — identical, with
`ExploreLayout` as the function name.

`apps/mobile/src/app/(tabs)/search/_layout.tsx` already exists; fix its
indentation to two spaces to match the rest of the repo.

- [ ] **Step 5: Create the tab-root screens with headers**

`apps/mobile/src/app/(tabs)/(home)/index.tsx`:

```tsx
import { Stack } from "expo-router";

import { ProfileToolbar } from "@/components/profile-toolbar";

export default function HomeScreen() {
  return (
    <>
      <Stack.Title large>Home</Stack.Title>
      <ProfileToolbar />
    </>
  );
}
```

`apps/mobile/src/app/(tabs)/explore/index.tsx` — the same with
`<Stack.Title large>Explore</Stack.Title>` and `ExploreScreen`.

Replace `apps/mobile/src/app/(tabs)/search/index.tsx`:

```tsx
import { Stack } from "expo-router";

import { ProfileToolbar } from "@/components/profile-toolbar";

export default function SearchScreen() {
  return (
    <>
      <Stack.Title large>Search</Stack.Title>
      <ProfileToolbar />
      <Stack.SearchBar placement="automatic" placeholder="Search games" />
    </>
  );
}
```

Screen bodies arrive in Tasks 15–17; this task delivers the navigation shell.

- [ ] **Step 6: Create the detail route stubs**

The row taps added in Task 15 need somewhere to land, so the routes exist now
and get their body in Task 18.

`apps/mobile/src/app/(tabs)/(home)/game/[id].tsx`:

```tsx
import { Stack, useLocalSearchParams } from "expo-router";

export default function GameRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <Stack.Title>{`Game ${id}`}</Stack.Title>;
}
```

Copy the same file to `apps/mobile/src/app/(tabs)/explore/game/[id].tsx` and
`apps/mobile/src/app/(tabs)/search/game/[id].tsx`. Task 18 replaces all three
bodies with a re-export of one shared screen.

- [ ] **Step 7: Delete the old routes and the placeholder**

```bash
git rm apps/mobile/src/app/\(tabs\)/profile.tsx \
       apps/mobile/src/app/\(tabs\)/index.tsx \
       apps/mobile/src/app/\(tabs\)/explore.tsx \
       apps/mobile/src/components/placeholder-screen.tsx
```

`placeholder-screen.tsx` goes because every screen gets a real empty, loading
and error state; `query-boundary.tsx` and the two backlog empty states in
Task 14 and Task 15 cover everything it stood in for.

- [ ] **Step 8: Regenerate typed routes and run the app**

```bash
rm -rf apps/mobile/.expo/types
pnpm --filter mobile ios
```

Expected: three tabs — Home, Explore, Search. Each shows a large title and the
avatar top-right; tapping the avatar opens Clerk's native profile view. There is
no Profile tab. Search shows the native search field. Screen bodies are blank.

Regenerating `.expo/types` is not optional after routes move —
`experiments.typedRoutes` is on, and a stale cache presents as phantom typecheck
errors on `router.push`.

- [ ] **Step 9: Verify and commit**

Run: `pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm --filter mobile test`
Expected: PASS.

```bash
git add -A apps/mobile/src/app apps/mobile/src/components apps/mobile/src/theme.ts
git commit -m "feat(mobile): three tabs, per-tab stacks, avatar in every header

Profile is gone as a tab: the avatar in the top-right of each tab root opens
Clerk's UserProfileView, which is where profile management belongs. Home is the
route group (home) rather than a directory named index, so it still resolves to
/ while carrying its own Stack for the large title.

Each tab keeps its own stack so a pushed game detail stays inside the tab and
the native tab bar stays visible."
```

---

## Task 11: Display label formatting

**Files:**

- Create: `apps/mobile/src/features/game/format.ts`
- Test: `apps/mobile/test/format.test.ts`

**Interfaces:**

- Produces: `releaseYear(iso: string | null): string | null`, `metaLine(input: { firstReleaseDate: string | null; genres: { name: string }[] }): string | null`, `ratingLine(input: { totalRating: number | null; totalRatingCount: number }): string | null`, `statusLabel(status: BacklogStatus): string`, `statusButtonLabel(status: BacklogStatus | null): string`, `ratingButtonLabel(rating: number | null): string`, `rowSubtitle(entry: { status: BacklogStatus; rating: number | null }): string`, `releaseDateLine(iso: string | null): string`

- [ ] **Step 1: Write the failing test**

`apps/mobile/test/format.test.ts`:

```ts
import { BACKLOG_STATUSES } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import {
  metaLine,
  ratingButtonLabel,
  ratingLine,
  releaseDateLine,
  releaseYear,
  rowSubtitle,
  statusButtonLabel,
  statusLabel,
} from "@/features/game/format";

describe("releaseYear", () => {
  it("extracts the year", () => {
    expect(releaseYear("2022-02-22T00:00:00.000Z")).toBe("2022");
  });

  it("returns null for an unreleased game", () => {
    expect(releaseYear(null)).toBeNull();
  });
});

describe("metaLine", () => {
  it("joins year and genres with a middle dot", () => {
    expect(
      metaLine({
        firstReleaseDate: "2022-02-22T00:00:00.000Z",
        genres: [{ name: "Role-playing (RPG)" }, { name: "Adventure" }],
      }),
    ).toBe("2022 · Role-playing (RPG), Adventure");
  });

  it("omits the year when there is no release date", () => {
    expect(metaLine({ firstReleaseDate: null, genres: [{ name: "Indie" }] })).toBe("Indie");
  });

  it("omits genres when there are none", () => {
    expect(metaLine({ firstReleaseDate: "1998-11-21T00:00:00.000Z", genres: [] })).toBe("1998");
  });

  it("returns null when there is nothing to say", () => {
    expect(metaLine({ firstReleaseDate: null, genres: [] })).toBeNull();
  });
});

describe("ratingLine", () => {
  it("rounds the rating and groups the count", () => {
    expect(ratingLine({ totalRating: 95.6231, totalRatingCount: 12481 })).toBe(
      "★ 96 · 12,481 ratings",
    );
  });

  it("says rating for a single rating", () => {
    expect(ratingLine({ totalRating: 80, totalRatingCount: 1 })).toBe("★ 80 · 1 rating");
  });

  it("returns null for an unrated game", () => {
    expect(ratingLine({ totalRating: null, totalRatingCount: 0 })).toBeNull();
  });
});

describe("statusLabel", () => {
  it("titlecases every status", () => {
    expect(statusLabel("waiting")).toBe("Waiting");
    expect(statusLabel("playing")).toBe("Playing");
    expect(statusLabel("completed")).toBe("Completed");
    expect(statusLabel("abandoned")).toBe("Abandoned");
  });

  it("has a label for every status in the enum", () => {
    for (const status of BACKLOG_STATUSES) {
      expect(statusLabel(status)).not.toBe("");
    }
  });
});

describe("statusButtonLabel", () => {
  it("prompts to add when the game is untracked", () => {
    expect(statusButtonLabel(null)).toBe("Add to Backlog");
  });

  it("shows the current status when tracked", () => {
    expect(statusButtonLabel("playing")).toBe("Playing");
  });
});

describe("ratingButtonLabel", () => {
  it("shows the rating when set", () => {
    expect(ratingButtonLabel(8)).toBe("8");
  });

  it("shows nothing but the symbol when unrated", () => {
    expect(ratingButtonLabel(null)).toBe("");
  });
});

describe("rowSubtitle", () => {
  it("combines status and rating", () => {
    expect(rowSubtitle({ status: "playing", rating: 9 })).toBe("Playing · ★9");
  });

  it("shows only the status when unrated", () => {
    expect(rowSubtitle({ status: "waiting", rating: null })).toBe("Waiting");
  });
});

describe("releaseDateLine", () => {
  it("formats a full date", () => {
    expect(releaseDateLine("2022-02-22T00:00:00.000Z")).toBe("22 February 2022");
  });

  it("says unknown when there is no date", () => {
    expect(releaseDateLine(null)).toBe("Unknown");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter mobile test format`
Expected: FAIL — cannot resolve `@/features/game/format`.

- [ ] **Step 3: Implement**

`apps/mobile/src/features/game/format.ts`:

```ts
import type { BacklogStatus } from "@repo/contracts";

/**
 * Every user-facing string built from API data. Pure, so the copy is pinned by
 * tests rather than discovered in a screenshot — and so a game with no release
 * date, no genres and no ratings cannot produce a line reading " · ".
 *
 * The `en-GB` locale is fixed rather than taken from the device: these are
 * dates in a catalogue, not the user's own data, and a stable format keeps the
 * detail screen's rows from reflowing per locale.
 */

const STATUS_LABELS: Record<BacklogStatus, string> = {
  waiting: "Waiting",
  playing: "Playing",
  completed: "Completed",
  abandoned: "Abandoned",
};

/** Joins only the parts that exist, so an absent field leaves no separator. */
function joinParts(parts: (string | null)[], separator: string): string | null {
  const present = parts.filter((part): part is string => part !== null && part !== "");

  return present.length === 0 ? null : present.join(separator);
}

export function releaseYear(iso: string | null): string | null {
  return iso === null ? null : String(new Date(iso).getUTCFullYear());
}

export function metaLine(input: {
  firstReleaseDate: string | null;
  genres: { name: string }[];
}): string | null {
  const genres = input.genres.length === 0 ? null : input.genres.map((g) => g.name).join(", ");

  return joinParts([releaseYear(input.firstReleaseDate), genres], " · ");
}

export function ratingLine(input: {
  totalRating: number | null;
  totalRatingCount: number;
}): string | null {
  if (input.totalRating === null) return null;

  const count = input.totalRatingCount.toLocaleString("en-GB");
  const noun = input.totalRatingCount === 1 ? "rating" : "ratings";

  return `★ ${Math.round(input.totalRating)} · ${count} ${noun}`;
}

export function statusLabel(status: BacklogStatus): string {
  return STATUS_LABELS[status];
}

/** The prominent capsule doubles as the add affordance when untracked. */
export function statusButtonLabel(status: BacklogStatus | null): string {
  return status === null ? "Add to Backlog" : statusLabel(status);
}

export function ratingButtonLabel(rating: number | null): string {
  return rating === null ? "" : String(rating);
}

export function rowSubtitle(entry: { status: BacklogStatus; rating: number | null }): string {
  return entry.rating === null
    ? statusLabel(entry.status)
    : `${statusLabel(entry.status)} · ★${entry.rating}`;
}

export function releaseDateLine(iso: string | null): string {
  if (iso === null) return "Unknown";

  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter mobile test format`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/game/format.ts apps/mobile/test/format.test.ts
git commit -m "feat(mobile): pure display label builders

joinParts is the point: a game with no release date, no genres and no ratings
must not produce a line reading ' · '. Pinning the copy in tests beats
discovering it in a screenshot."
```

---

## Task 12: Backlog sections

**Files:**

- Create: `apps/mobile/src/features/backlog/sections.ts`
- Test: `apps/mobile/test/sections.test.ts`

**Interfaces:**

- Produces: `STATUS_ORDER`, `type BacklogSection = { status: BacklogStatus; title: string | null; count: number; data: BacklogListItemWire[] }`, `toSections(items: BacklogListItemWire[], filter: BacklogStatus | undefined): BacklogSection[]`

- [ ] **Step 1: Write the failing test**

`apps/mobile/test/sections.test.ts`:

```ts
import { BACKLOG_STATUSES, type BacklogListItemWire, type BacklogStatus } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { STATUS_ORDER, toSections } from "@/features/backlog/sections";

let nextId = 1;

const entry = (status: BacklogStatus, name = `Game ${nextId}`): BacklogListItemWire => {
  const id = nextId++;

  return {
    gameId: id,
    status,
    rating: null,
    addedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    game: {
      id,
      name,
      slug: `game-${id}`,
      coverImageId: null,
      firstReleaseDate: null,
      totalRating: null,
      totalRatingCount: 0,
    },
  };
};

describe("STATUS_ORDER", () => {
  it("is Playing, Waiting, Completed, Abandoned", () => {
    expect(STATUS_ORDER).toEqual(["playing", "waiting", "completed", "abandoned"]);
  });

  it("covers every status in the enum, so none can go unrendered", () => {
    expect([...STATUS_ORDER].sort()).toEqual([...BACKLOG_STATUSES].sort());
  });
});

describe("toSections — unfiltered", () => {
  it("orders sections Playing, Waiting, Completed, Abandoned regardless of input order", () => {
    const sections = toSections(
      [entry("abandoned"), entry("completed"), entry("waiting"), entry("playing")],
      undefined,
    );

    expect(sections.map((s) => s.status)).toEqual(["playing", "waiting", "completed", "abandoned"]);
  });

  it("titles each section", () => {
    expect(toSections([entry("playing")], undefined)[0]?.title).toBe("Playing");
  });

  it("omits statuses with no entries", () => {
    const sections = toSections([entry("playing"), entry("completed")], undefined);

    expect(sections.map((s) => s.status)).toEqual(["playing", "completed"]);
  });

  it("counts the entries in each section", () => {
    const sections = toSections([entry("playing"), entry("playing"), entry("waiting")], undefined);

    expect(sections.map((s) => s.count)).toEqual([2, 1]);
  });

  it("preserves the order the API returned within a section", () => {
    const first = entry("playing", "First");
    const second = entry("playing", "Second");
    const sections = toSections([first, second], undefined);

    expect(sections[0]?.data.map((i) => i.game.name)).toEqual(["First", "Second"]);
  });

  it("returns no sections for an empty backlog", () => {
    expect(toSections([], undefined)).toEqual([]);
  });
});

describe("toSections — filtered", () => {
  it("returns one headerless section so SectionList stays the single code path", () => {
    const sections = toSections([entry("completed"), entry("completed")], "completed");

    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBeNull();
    expect(sections[0]?.count).toBe(2);
  });

  it("returns no sections when the filter matches nothing", () => {
    expect(toSections([], "abandoned")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter mobile test sections`
Expected: FAIL — cannot resolve `@/features/backlog/sections`.

- [ ] **Step 3: Implement**

`apps/mobile/src/features/backlog/sections.ts`:

```ts
import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";

import { statusLabel } from "@/features/game/format";

/**
 * Display order for the Home list when All is selected: what you are playing
 * now, then what is next, then what is done with.
 *
 * Deliberately NOT `BACKLOG_STATUSES` from `@repo/contracts`, and deliberately
 * not added there either. That constant is the declaration order of the
 * Postgres enum and `packages/db`'s status-parity test depends on it —
 * reordering it to suit this screen would break the database contract. The
 * tempting one-line change is the wrong one.
 */
export const STATUS_ORDER = ["playing", "waiting", "completed", "abandoned"] as const;

export interface BacklogSection {
  status: BacklogStatus;
  /** `null` when a single status is filtered — the header renders nothing. */
  title: string | null;
  count: number;
  data: BacklogListItemWire[];
}

/**
 * Grouping happens on the client because the whole collection already arrives
 * unpaginated in one response (API design §8), so the sort is free — and
 * because this order is a property of this screen, not something the API should
 * grow a `sort=status` for.
 *
 * A filtered call returns one section with a null title, so `SectionList` is
 * the single code path for both cases rather than a branch between two list
 * components.
 */
export function toSections(
  items: BacklogListItemWire[],
  filter: BacklogStatus | undefined,
): BacklogSection[] {
  if (filter !== undefined) {
    return items.length === 0
      ? []
      : [{ status: filter, title: null, count: items.length, data: items }];
  }

  const grouped = new Map<BacklogStatus, BacklogListItemWire[]>();
  // Insertion order preserves what the API returned — `updated_at DESC` — so
  // the most recently touched game sits at the top of each section.
  for (const item of items) {
    const bucket = grouped.get(item.status);
    if (bucket) bucket.push(item);
    else grouped.set(item.status, [item]);
  }

  return STATUS_ORDER.flatMap((status) => {
    const data = grouped.get(status);
    if (!data) return [];

    return [{ status, title: statusLabel(status), count: data.length, data }];
  });
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter mobile test sections`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/backlog/sections.ts apps/mobile/test/sections.test.ts
git commit -m "feat(mobile): group the backlog by status in display order

Playing, Waiting, Completed, Abandoned — a mobile presentation order kept out
of @repo/contracts on purpose, because BACKLOG_STATUSES there is the Postgres
enum's declaration order and packages/db's status-parity test depends on it.

A filtered call returns one headerless section, so SectionList is the single
code path rather than a branch between two list components."
```

---

## Task 13: Empty-state copy

**Files:**

- Create: `apps/mobile/src/features/backlog/empty-states.ts`
- Test: `apps/mobile/test/empty-states.test.ts`

**Interfaces:**

- Produces: `type EmptyState = { title: string; systemImage: string; description: string }`, `EMPTY_BACKLOG: EmptyState`, `EMPTY_FILTER: Record<BacklogStatus, EmptyState>`

- [ ] **Step 1: Write the failing test**

`apps/mobile/test/empty-states.test.ts`:

```ts
import { BACKLOG_STATUSES } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { EMPTY_BACKLOG, EMPTY_FILTER } from "@/features/backlog/empty-states";

describe("EMPTY_BACKLOG", () => {
  it("is the onboarding state", () => {
    expect(EMPTY_BACKLOG.title).toBe("Your backlog is empty");
    expect(EMPTY_BACKLOG.systemImage).toBe("gamecontroller");
    expect(EMPTY_BACKLOG.description).toMatch(/what you're playing/);
  });
});

describe("EMPTY_FILTER", () => {
  it("has copy for every status in the enum", () => {
    // Keyed off BACKLOG_STATUSES so adding a fifth status fails here rather
    // than shipping a blank screen.
    for (const status of BACKLOG_STATUSES) {
      const state = EMPTY_FILTER[status];

      expect(state, `missing empty state for "${status}"`).toBeDefined();
      expect(state.title).not.toBe("");
      expect(state.systemImage).not.toBe("");
      expect(state.description).not.toBe("");
    }
  });

  it("has no extra keys beyond the enum", () => {
    expect(Object.keys(EMPTY_FILTER).sort()).toEqual([...BACKLOG_STATUSES].sort());
  });

  it("uses the per-status symbol from the design", () => {
    expect(EMPTY_FILTER.waiting.systemImage).toBe("clock");
    expect(EMPTY_FILTER.playing.systemImage).toBe("gamecontroller");
    expect(EMPTY_FILTER.completed.systemImage).toBe("checkmark.seal");
    expect(EMPTY_FILTER.abandoned.systemImage).toBe("xmark.bin");
  });

  it("gives each status distinct copy", () => {
    const titles = BACKLOG_STATUSES.map((s) => EMPTY_FILTER[s].title);

    expect(new Set(titles).size).toBe(titles.length);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter mobile test empty-states`
Expected: FAIL — cannot resolve `@/features/backlog/empty-states`.

- [ ] **Step 3: Implement**

`apps/mobile/src/features/backlog/empty-states.ts`:

```ts
import type { BacklogStatus } from "@repo/contracts";
import type { SFSymbol } from "sf-symbols-typescript";

export interface EmptyState {
  title: string;
  systemImage: SFSymbol;
  description: string;
}

/**
 * Two empty states, because they mean different things.
 *
 * An empty backlog is an onboarding moment and gets a call to action. A filter
 * that happens to match nothing is not — the user knows what they did, and the
 * filter itself is the way out, so a button pointing elsewhere would be noise.
 */
export const EMPTY_BACKLOG: EmptyState = {
  title: "Your backlog is empty",
  systemImage: "gamecontroller",
  description:
    "Add the games you own and Barklog will keep track of what you're playing, what's up next, and what you've finally finished.",
};

export const EMPTY_FILTER: Record<BacklogStatus, EmptyState> = {
  waiting: {
    title: "Nothing waiting",
    systemImage: "clock",
    description: "Games you plan to get to will show up here.",
  },
  playing: {
    title: "Nothing in progress",
    systemImage: "gamecontroller",
    description: "Mark a game as Playing and it will show up here.",
  },
  completed: {
    title: "Nothing finished yet",
    systemImage: "checkmark.seal",
    description: "Games you see through to the end will show up here.",
  },
  abandoned: {
    title: "Nothing abandoned",
    systemImage: "xmark.bin",
    description: "Games you give up on will show up here. No judgement.",
  },
};
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `pnpm --filter mobile test empty-states`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/backlog/empty-states.ts apps/mobile/test/empty-states.test.ts
git commit -m "feat(mobile): copy for both backlog empty states

An empty backlog is an onboarding moment and earns a call to action; a filter
that matches nothing is not — the filter itself is the way out. The test is
keyed off BACKLOG_STATUSES so adding a fifth status fails here rather than
shipping a blank screen."
```

---

## Task 14: Shared presentation components

**Files:**

- Create: `apps/mobile/src/components/cover.tsx`, `apps/mobile/src/components/game-row.tsx`, `apps/mobile/src/components/query-boundary.tsx`, `apps/mobile/src/components/native-state.tsx`

**Interfaces:**

- Consumes: `coverUrl` (Task 3), `isApiError` (Task 5), `rowSubtitle`/`metaLine` (Task 11), `Type`/`Brand`/`COVER_ASPECT` (Task 10)
- Produces: `<Cover imageId size width />`, `<GameRow title subtitle coverImageId onPress />`, `<QueryBoundary query children />`, `<NativeState title systemImage description action? />`

- [ ] **Step 1: Create the native state view**

`apps/mobile/src/components/native-state.tsx`:

```tsx
import { Button, ContentUnavailableView, Host, VStack } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize } from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";
import { StyleSheet } from "react-native";

import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";
import { Brand } from "@/theme";

/**
 * `ContentUnavailableView` takes only title, systemImage and description — it
 * has no children and no action slot — so a call to action has to be a sibling
 * in the `VStack` rather than a child of it.
 */
export function NativeState({
  title,
  systemImage,
  description,
  action,
}: {
  title: string;
  systemImage: SFSymbol;
  description: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <Host style={styles.host} seedColor={Brand.tint} useViewportSizeMeasurement>
      <VStack spacing={16}>
        <ContentUnavailableView title={title} systemImage={systemImage} description={description} />
        {action ? (
          <Button
            label={action.label}
            onPress={action.onPress}
            modifiers={[buttonStyle(GLASS_PROMINENT_STYLE), controlSize("large")]}
          />
        ) : null}
      </VStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
```

- [ ] **Step 2: Create the query boundary**

`apps/mobile/src/components/query-boundary.tsx`:

```tsx
import { Host, ProgressView } from "@expo/ui/swift-ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";

import { isApiError } from "@/api/errors";
import { NativeState } from "@/components/native-state";
import { Brand } from "@/theme";

/**
 * Error copy is keyed off status rather than shown verbatim, because a 5xx
 * problem document carries no `detail` by design — the API strips exception
 * messages so they cannot leak schema names and file paths.
 */
function errorState(error: unknown): { title: string; description: string } {
  if (!isApiError(error)) {
    return { title: "Something went wrong", description: "Please try again." };
  }

  if (error.status === 0) {
    return { title: "You're offline", description: error.detail ?? "Check your connection." };
  }

  if (error.status === 429) {
    return {
      title: "Slow down a moment",
      description: "You've made a lot of requests. Try again shortly.",
    };
  }

  if (error.status >= 500) {
    return {
      title: "Barklog is having trouble",
      description: "The server couldn't answer. Try again in a moment.",
    };
  }

  return { title: error.title, description: error.detail ?? "Please try again." };
}

export function QueryBoundary<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  /**
   * Data we already hold wins over an error, and this ordering is the whole
   * point of the component.
   *
   * TanStack's result union has a `QueryObserverRefetchErrorResult` variant
   * carrying `data: TData` together with `isError: true` — a background refetch
   * or a failed pull-to-refresh on a screen that already has content. Checking
   * `isError` before `data` would replace a list the user is reading with a
   * full-screen error, which is the wrong trade: the stale list is still
   * useful and the refresh spinner stopping is signal enough.
   *
   * It also gives `placeholderData: keepPreviousData` (used by search) its
   * behaviour for free: previous results stay on screen while the next query
   * resolves.
   */
  if (query.data !== undefined) return children(query.data);

  if (query.isPending) {
    return (
      <Host style={styles.host} seedColor={Brand.tint} useViewportSizeMeasurement>
        <ProgressView />
      </Host>
    );
  }

  // Errored with nothing to fall back on.
  const { title, description } = errorState(query.error);

  return (
    <NativeState
      title={title}
      systemImage="exclamationmark.triangle"
      description={description}
      action={{ label: "Try Again", onPress: () => void query.refetch() }}
    />
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
```

- [ ] **Step 3: Create the cover**

`apps/mobile/src/components/cover.tsx`:

```tsx
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { PlatformColor, StyleSheet, View } from "react-native";

import { coverUrl, type CoverSize } from "@/igdb-image";
import { COVER_ASPECT } from "@/theme";

/**
 * Plain React Native, not `@expo/ui`: SwiftUI's `Image` accepts an SF Symbol, an
 * asset-catalog name or a local file URI — it has no remote-URL prop, and every
 * cover here comes from images.igdb.com.
 *
 * `expo-image` is chosen for its disk cache: a backlog re-opened five times a
 * day should not re-download the same 40 covers.
 */
export function Cover({
  imageId,
  size,
  width,
}: {
  imageId: string | null;
  size: CoverSize;
  width: number;
}) {
  const uri = coverUrl(imageId, size);
  const style = { width, height: width / COVER_ASPECT };

  if (uri === null) {
    return (
      <View style={[styles.placeholder, style]}>
        <SymbolView
          name="gamecontroller"
          size={width * 0.45}
          tintColor={PlatformColor("secondaryLabel")}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, style]}
      contentFit="cover"
      transition={150}
      cachePolicy="disk"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: 6,
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  placeholder: {
    borderRadius: 6,
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
    alignItems: "center",
    justifyContent: "center",
  },
});
```

- [ ] **Step 4: Create the row**

`apps/mobile/src/components/game-row.tsx`:

```tsx
import { SymbolView } from "expo-symbols";
import { Pressable, PlatformColor, StyleSheet, Text, View } from "react-native";

import { Cover } from "@/components/cover";
import { Type } from "@/theme";

const COVER_WIDTH = 44;

export function GameRow({
  title,
  subtitle,
  coverImageId,
  onPress,
}: {
  title: string;
  subtitle: string | null;
  coverImageId: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={subtitle === null ? title : `${title}, ${subtitle}`}
    >
      <Cover imageId={coverImageId} size="small" width={COVER_WIDTH} />

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle === null ? null : (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <SymbolView name="chevron.right" size={13} tintColor={PlatformColor("tertiaryLabel")} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: PlatformColor("systemBackground"),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor("separator"),
  },
  pressed: {
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  text: { flex: 1, gap: 2 },
  title: { ...Type.headline, color: PlatformColor("label") },
  subtitle: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
});
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm --filter mobile test`
Expected: PASS.

```bash
git add apps/mobile/src/components
git commit -m "feat(mobile): shared row, cover, loading and error presentation

Covers are plain React Native because SwiftUI's Image has no remote-URL prop,
and expo-image's disk cache is the point: a backlog opened five times a day
should not re-download the same 40 covers.

Error copy is keyed off status rather than shown verbatim — a 5xx problem
document carries no detail by design, since the API strips exception messages."
```

---

## Task 15: Home — the backlog

**Files:**

- Create: `apps/mobile/src/api/hooks.ts`, `apps/mobile/src/features/backlog/backlog-screen.tsx`, `apps/mobile/src/features/backlog/status-filter.tsx`
- Modify: `apps/mobile/src/app/(tabs)/(home)/index.tsx`

**Interfaces:**

- Consumes: `useApi` (Task 9), `keys` (Task 7), `toSections` (Task 12), `EMPTY_BACKLOG`/`EMPTY_FILTER` (Task 13), `GameRow`/`QueryBoundary`/`NativeState` (Task 14), `rowSubtitle` (Task 11)
- Produces: `useBacklog`, `useBacklogStats`, `usePopularGames`, `useSearchGames`, `useGame`, `useUpsertBacklogEntry`, `useDeleteBacklogEntry` from `@/api/hooks`; `<BacklogScreen />`; `<StatusFilter value onChange />`

- [ ] **Step 1: Create all the hooks**

They are written once here so Tasks 16–18 consume rather than extend them.

`apps/mobile/src/api/hooks.ts`:

```ts
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  SEARCH_LIMIT_DEFAULT,
  SEARCH_QUERY_MIN,
  type BacklogEntryWire,
  type BacklogListResponse,
  type BacklogSort,
  type BacklogStatsWire,
  type BacklogStatus,
  type GameDetailResponse,
  type GameListResponse,
} from "@repo/contracts";

import { keys } from "./keys";
import { useApi } from "./provider";

export function useBacklog(
  status: BacklogStatus | undefined,
  sort: BacklogSort = "updated_at",
): UseQueryResult<BacklogListResponse> {
  const api = useApi();

  return useQuery({
    queryKey: keys.backlog.list(status, sort),
    queryFn: () => api.listBacklog({ status, sort }),
  });
}

export function useBacklogStats(): UseQueryResult<BacklogStatsWire> {
  const api = useApi();

  return useQuery({ queryKey: keys.backlog.stats(), queryFn: () => api.getBacklogStats() });
}

export function usePopularGames(limit = SEARCH_LIMIT_DEFAULT): UseQueryResult<GameListResponse> {
  const api = useApi();

  return useQuery({
    queryKey: keys.games.popular(limit),
    queryFn: () => api.popularGames({ limit }),
  });
}

export function useSearchGames(
  q: string,
  limit = SEARCH_LIMIT_DEFAULT,
): UseQueryResult<GameListResponse> {
  const api = useApi();

  return useQuery({
    queryKey: keys.games.search(q, limit, 0),
    queryFn: () => api.searchGames({ q, limit }),
    // The API rejects a shorter query with a 422; not asking is better than
    // being told no.
    enabled: q.length >= SEARCH_QUERY_MIN,
    // Results stay on screen while the next keystroke's query resolves, so the
    // list does not blank between characters.
    placeholderData: keepPreviousData,
  });
}

export function useGame(id: number): UseQueryResult<GameDetailResponse> {
  const api = useApi();

  return useQuery({ queryKey: keys.games.detail(id), queryFn: () => api.getGame(id) });
}

/**
 * `PUT` is a full replace of a two-field resource, so the optimistic patch can
 * simply write the new entry — there is no partial state to merge. The whole
 * backlog namespace is invalidated on settle, which sweeps the list and the
 * stats together because they share a first key element.
 */
export function useUpsertBacklogEntry(gameId: number) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { status: BacklogStatus; rating: number | null }) =>
      api.upsertBacklogEntry(gameId, input),

    onMutate: async (input) => {
      const key = keys.games.detail(gameId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GameDetailResponse>(key);

      if (previous) {
        const entry: BacklogEntryWire = {
          gameId,
          status: input.status,
          rating: input.rating,
          addedAt: previous.backlogEntry?.addedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        queryClient.setQueryData<GameDetailResponse>(key, { ...previous, backlogEntry: entry });
      }

      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.games.detail(gameId), context.previous);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.games.detail(gameId) });
      void queryClient.invalidateQueries({ queryKey: keys.backlog.all });
    },
  });
}

export function useDeleteBacklogEntry(gameId: number) {
  const api = useApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.deleteBacklogEntry(gameId),

    onMutate: async () => {
      const key = keys.games.detail(gameId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GameDetailResponse>(key);

      if (previous) {
        queryClient.setQueryData<GameDetailResponse>(key, { ...previous, backlogEntry: null });
      }

      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(keys.games.detail(gameId), context.previous);
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.games.detail(gameId) });
      void queryClient.invalidateQueries({ queryKey: keys.backlog.all });
    },
  });
}
```

- [ ] **Step 2: Create the status filter**

`apps/mobile/src/features/backlog/status-filter.tsx`:

```tsx
import { Host, Picker, Text } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import type { BacklogStatus } from "@repo/contracts";
import { StyleSheet } from "react-native";

import { STATUS_ORDER } from "@/features/backlog/sections";
import { statusLabel } from "@/features/game/format";
import { Brand } from "@/theme";

const ALL = "all";

/**
 * A real UISegmentedControl via SwiftUI, per the composition rule: lists are
 * React Native, controls are `@expo/ui`.
 *
 * Options follow `STATUS_ORDER`, so the segments read in the same order the
 * sections below them do.
 */
export function StatusFilter({
  value,
  onChange,
}: {
  value: BacklogStatus | undefined;
  onChange: (status: BacklogStatus | undefined) => void;
}) {
  return (
    <Host style={styles.host} matchContents={{ vertical: true }} seedColor={Brand.tint}>
      <Picker
        selection={value ?? ALL}
        onSelectionChange={(selection) =>
          onChange(selection === ALL ? undefined : (selection as BacklogStatus))
        }
        modifiers={[pickerStyle("segmented")]}
      >
        <Text modifiers={[tag(ALL)]}>All</Text>
        {STATUS_ORDER.map((status) => (
          <Text key={status} modifiers={[tag(status)]}>
            {statusLabel(status)}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { marginHorizontal: 16, marginBottom: 8 },
});
```

- [ ] **Step 3: Create the screen**

`apps/mobile/src/features/backlog/backlog-screen.tsx`:

```tsx
import type { BacklogListItemWire, BacklogStatus } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { PlatformColor, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";

import { useBacklog, useBacklogStats } from "@/api/hooks";
import { GameRow } from "@/components/game-row";
import { NativeState } from "@/components/native-state";
import { QueryBoundary } from "@/components/query-boundary";
import { EMPTY_BACKLOG, EMPTY_FILTER } from "@/features/backlog/empty-states";
import { toSections } from "@/features/backlog/sections";
import { StatusFilter } from "@/features/backlog/status-filter";
import { rowSubtitle } from "@/features/game/format";
import { Type } from "@/theme";

export function BacklogScreen() {
  const [filter, setFilter] = useState<BacklogStatus | undefined>(undefined);
  const backlog = useBacklog(filter);
  const stats = useBacklogStats();
  const router = useRouter();

  const renderItem = useCallback(
    ({ item }: { item: BacklogListItemWire }) => (
      <GameRow
        title={item.game.name}
        subtitle={rowSubtitle(item)}
        coverImageId={item.game.coverImageId}
        onPress={() => router.push(`/game/${item.gameId}`)}
      />
    ),
    [router],
  );

  return (
    <QueryBoundary query={backlog}>
      {(data) => {
        const sections = toSections(data.items, filter);

        // The onboarding state: nothing tracked at all. The filter and the
        // stats line are hidden here on purpose — a filter over nothing is
        // noise, and the only useful thing to offer is a way to find a game.
        if (filter === undefined && data.items.length === 0) {
          return (
            <NativeState
              title={EMPTY_BACKLOG.title}
              systemImage={EMPTY_BACKLOG.systemImage}
              description={EMPTY_BACKLOG.description}
              action={{ label: "Find a Game", onPress: () => router.navigate("/search") }}
            />
          );
        }

        return (
          <SectionList
            style={styles.list}
            sections={sections}
            keyExtractor={(item) => String(item.gameId)}
            renderItem={renderItem}
            ListHeaderComponent={
              <View style={styles.header}>
                <StatusFilter value={filter} onChange={setFilter} />
                {stats.data ? (
                  <Text style={styles.stats}>
                    {`${stats.data.total} ${stats.data.total === 1 ? "game" : "games"}`}
                    {stats.data.averageRating === null ? "" : ` · avg ★${stats.data.averageRating}`}
                  </Text>
                ) : null}
              </View>
            }
            renderSectionHeader={({ section }) =>
              // Null title means a single status is filtered, so there is
              // nothing worth a header.
              section.title === null ? null : (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title.toUpperCase()}</Text>
                  <Text style={styles.sectionCount}>{section.count}</Text>
                </View>
              )
            }
            ListEmptyComponent={
              filter === undefined ? null : (
                <NativeState
                  title={EMPTY_FILTER[filter].title}
                  systemImage={EMPTY_FILTER[filter].systemImage}
                  description={EMPTY_FILTER[filter].description}
                />
              )
            }
            refreshControl={
              <RefreshControl
                refreshing={backlog.isRefetching}
                onRefresh={() => {
                  void backlog.refetch();
                  void stats.refetch();
                }}
              />
            }
            contentInsetAdjustmentBehavior="automatic"
            stickySectionHeadersEnabled
          />
        );
      }}
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  header: { paddingTop: 8, gap: 4 },
  stats: {
    ...Type.footnote,
    color: PlatformColor("secondaryLabel"),
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    backgroundColor: PlatformColor("systemBackground"),
  },
  sectionTitle: {
    ...Type.footnote,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: PlatformColor("secondaryLabel"),
  },
  sectionCount: { ...Type.footnote, color: PlatformColor("tertiaryLabel") },
});
```

- [ ] **Step 4: Mount it**

Replace `apps/mobile/src/app/(tabs)/(home)/index.tsx`:

```tsx
import { Stack } from "expo-router";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { BacklogScreen } from "@/features/backlog/backlog-screen";

export default function HomeRoute() {
  return (
    <>
      <Stack.Title large>Home</Stack.Title>
      <ProfileToolbar />
      <BacklogScreen />
    </>
  );
}
```

- [ ] **Step 5: Exercise it on device**

Run: `pnpm --filter mobile ios` — with the API running (`pnpm --filter api dev`)
and Postgres/Valkey up (`pnpm deps:up`).

Verify:

1. A fresh account shows the onboarding empty state with a **Find a Game**
   button that switches to the Search tab, and **no** segmented filter.
2. With entries present, sections appear in the order Playing, Waiting,
   Completed, Abandoned, with counts, and empty statuses are absent.
3. Selecting a single status removes the section headers.
4. Selecting a status with no entries shows that status's empty state with the
   filter still visible.
5. Pull-to-refresh works.
6. Covers load and are cached on a second visit.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm --filter mobile test`
Expected: PASS.

```bash
git add apps/mobile/src/api/hooks.ts apps/mobile/src/features/backlog apps/mobile/src/app
git commit -m "feat(mobile): Home renders the backlog on real data

Sections in display order with counts, a segmented status filter, stats, and
two distinct empty states — the onboarding one hides the filter, because a
filter over nothing is noise.

All query and mutation hooks land here so the remaining screens consume rather
than extend them. The mutations invalidate keys.backlog.all, which sweeps the
list and the stats together."
```

---

## Task 16: Explore

**Files:**

- Create: `apps/mobile/src/features/explore/explore-screen.tsx`
- Modify: `apps/mobile/src/app/(tabs)/explore/index.tsx`

**Interfaces:**

- Consumes: `usePopularGames` (Task 15), `GameRow`/`QueryBoundary`/`NativeState` (Task 14), `metaLine` (Task 11)

- [ ] **Step 1: Create the screen**

`apps/mobile/src/features/explore/explore-screen.tsx`:

```tsx
import type { GameSummaryWire } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, PlatformColor, RefreshControl, StyleSheet } from "react-native";

import { usePopularGames } from "@/api/hooks";
import { GameRow } from "@/components/game-row";
import { NativeState } from "@/components/native-state";
import { QueryBoundary } from "@/components/query-boundary";
import { metaLine } from "@/features/game/format";

const POPULAR_LIMIT = 50;

export function ExploreScreen() {
  const popular = usePopularGames(POPULAR_LIMIT);
  const router = useRouter();

  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire }) => (
      // `GameSummaryWire` is the summary projection and carries no `genres` —
      // search and popular return summaries, not details — so the subtitle is
      // the release year alone.
      <GameRow
        title={item.name}
        subtitle={metaLine({ firstReleaseDate: item.firstReleaseDate, genres: [] })}
        coverImageId={item.coverImageId}
        onPress={() => router.push(`/game/${item.id}`)}
      />
    ),
    [router],
  );

  return (
    <QueryBoundary query={popular}>
      {(data) => (
        <FlatList
          style={styles.list}
          data={data.items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          ListEmptyComponent={
            <NativeState
              title="Nothing to sniff out yet"
              systemImage="safari"
              description="The catalogue is still syncing. Check back shortly."
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={popular.isRefetching}
              onRefresh={() => void popular.refetch()}
            />
          }
          contentInsetAdjustmentBehavior="automatic"
        />
      )}
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
});
```

- [ ] **Step 2: Mount it**

Replace `apps/mobile/src/app/(tabs)/explore/index.tsx`:

```tsx
import { Stack } from "expo-router";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { ExploreScreen } from "@/features/explore/explore-screen";

export default function ExploreRoute() {
  return (
    <>
      <Stack.Title large>Explore</Stack.Title>
      <ProfileToolbar />
      <ExploreScreen />
    </>
  );
}
```

- [ ] **Step 3: Exercise it on device**

Run: `pnpm --filter mobile ios`
Verify: the Explore tab lists 50 popular games with covers, the large title and
avatar are present, pull-to-refresh works, and tapping a row pushes the stub
detail screen **inside** the tab with the tab bar still visible.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm --filter mobile test`
Expected: PASS.

```bash
git add apps/mobile/src/features/explore apps/mobile/src/app
git commit -m "feat(mobile): Explore lists the popular feed"
```

---

## Task 17: Search

**Files:**

- Create: `apps/mobile/src/features/search/search-screen.tsx`, `apps/mobile/src/hooks/use-debounced.ts`
- Modify: `apps/mobile/src/app/(tabs)/search/index.tsx`
- Test: `apps/mobile/test/use-debounced.test.ts` is **not** written — the hook uses React state. Its behaviour is verified on device in Step 4.

**Interfaces:**

- Consumes: `useSearchGames` (Task 15)
- Produces: `useDebounced<T>(value: T, delayMs: number): T`

- [ ] **Step 1: Create the debounce hook**

`apps/mobile/src/hooks/use-debounced.ts`:

```ts
import { useEffect, useState } from "react";

/**
 * 400 ms is chosen against the API's search rate limit of 30 requests/minute,
 * not for feel alone. Together with the query client's 60 s `staleTime` — which
 * makes a query the user has already typed free — it keeps type-ahead inside
 * the budget. Shortening this without raising the server limit will produce
 * 429s during fast typing.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

- [ ] **Step 2: Create the screen**

`apps/mobile/src/features/search/search-screen.tsx`:

```tsx
import { SEARCH_QUERY_MIN, type GameSummaryWire } from "@repo/contracts";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, PlatformColor, StyleSheet } from "react-native";

import { useSearchGames } from "@/api/hooks";
import { GameRow } from "@/components/game-row";
import { NativeState } from "@/components/native-state";
import { QueryBoundary } from "@/components/query-boundary";
import { metaLine } from "@/features/game/format";
import { useDebounced } from "@/hooks/use-debounced";

const DEBOUNCE_MS = 400;

export function SearchResults({ query }: { query: string }) {
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const search = useSearchGames(debounced);
  const router = useRouter();

  const renderItem = useCallback(
    ({ item }: { item: GameSummaryWire }) => (
      <GameRow
        title={item.name}
        subtitle={metaLine({ firstReleaseDate: item.firstReleaseDate, genres: [] })}
        coverImageId={item.coverImageId}
        onPress={() => router.push(`/game/${item.id}`)}
      />
    ),
    [router],
  );

  // The API rejects a shorter query with a 422, so the prompt state stands in
  // for it rather than the query firing and failing.
  if (debounced.length < SEARCH_QUERY_MIN) {
    return (
      <NativeState
        title="Fetch a game"
        systemImage="magnifyingglass"
        description="Search the whole catalogue by title. Two characters is enough to start."
      />
    );
  }

  return (
    <QueryBoundary query={search}>
      {(data) =>
        data.items.length === 0 ? (
          <NativeState
            title="No games found"
            systemImage="magnifyingglass"
            description={`Nothing in the catalogue matches "${debounced}".`}
          />
        ) : (
          <FlatList
            style={styles.list}
            data={data.items}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            keyboardDismissMode="on-drag"
            contentInsetAdjustmentBehavior="automatic"
          />
        )
      }
    </QueryBoundary>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
});
```

- [ ] **Step 3: Mount it**

Replace `apps/mobile/src/app/(tabs)/search/index.tsx`:

```tsx
import { Stack } from "expo-router";
import { useState } from "react";

import { ProfileToolbar } from "@/components/profile-toolbar";
import { SearchResults } from "@/features/search/search-screen";

export default function SearchRoute() {
  const [query, setQuery] = useState("");

  return (
    <>
      <Stack.Title large>Search</Stack.Title>
      <ProfileToolbar />
      <Stack.SearchBar
        placement="automatic"
        placeholder="Search games"
        // The native search bar hands over an event, not a string.
        onChangeText={(event) => setQuery(event.nativeEvent.text)}
      />
      <SearchResults query={query} />
    </>
  );
}
```

- [ ] **Step 4: Exercise it on device**

Run: `pnpm --filter mobile ios`
Verify:

1. The prompt state shows with an empty or one-character query.
2. Typing `zeld` returns Zelda titles, with the popular ones ranked first.
3. Results do not blank between keystrokes.
4. Typing continuously for 30 seconds does **not** produce the 429 state. If it
   does, raise `search` in `apps/api/src/rate-limits.ts` rather than shortening
   the debounce.
5. A nonsense query shows the no-results state.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter mobile lint && pnpm --filter mobile check-types && pnpm --filter mobile test`
Expected: PASS.

```bash
git add apps/mobile/src/features/search apps/mobile/src/hooks apps/mobile/src/app
git commit -m "feat(mobile): search-as-you-type against the mirror

The 400ms debounce is sized against the API's 30/min search limit, not for feel:
with the query client's 60s staleTime making repeated queries free, type-ahead
stays inside the budget. Shortening it without raising the server limit produces
429s during fast typing.

Two characters is the API's own floor, so the prompt state stands in for a query
that would be a 422."
```

---

## Task 18: Game detail

**Files:**

- Create: `apps/mobile/src/features/game/game-detail-screen.tsx`, `apps/mobile/src/features/game/hero.tsx`, `apps/mobile/src/features/game/entry-actions.tsx`, `apps/mobile/src/features/game/detail-rows.tsx`, `apps/mobile/src/features/game/expandable-summary.tsx`
- Modify: all three `app/(tabs)/*/game/[id].tsx`

**Interfaces:**

- Consumes: `useGame`/`useUpsertBacklogEntry`/`useDeleteBacklogEntry` (Task 15), `format.ts` (Task 11), `Cover` (Task 14), `coverUrl`/`screenshotUrl` (Task 3), `GLASS_STYLE`/`GLASS_PROMINENT_STYLE` (Task 4)

- [ ] **Step 1: Create the hero with the blurred backdrop**

`apps/mobile/src/features/game/hero.tsx`:

```tsx
import type { GameDetailResponse } from "@repo/contracts";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { Cover } from "@/components/cover";
import { coverUrl } from "@/igdb-image";
import { metaLine, ratingLine } from "@/features/game/format";
import { Type } from "@/theme";

const COVER_WIDTH = 132;

/**
 * Cover left, information right — chosen over Apple Music's centred arrangement
 * because game covers are 3:4 portrait rather than square, so side-by-side
 * wastes no vertical space.
 *
 * The backdrop is the same cover blurred and scaled to fill, faded into the
 * system background. Deriving it from the artwork is what makes every game
 * screen look different. A pale cover would wash out the title, so the gradient
 * is a two-stop scrim rather than a single fade — and a game with no cover gets
 * no blur layer at all rather than a grey smear.
 */
export function Hero({ game }: { game: GameDetailResponse }) {
  const backdrop = coverUrl(game.coverImageId, "big");
  const meta = metaLine({ firstReleaseDate: game.firstReleaseDate, genres: game.genres });
  const rating = ratingLine(game);
  const developer = game.developers[0]?.name ?? null;

  return (
    <View style={styles.container}>
      {backdrop === null ? null : (
        <View style={styles.backdrop} pointerEvents="none">
          <Image
            source={{ uri: backdrop }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={40}
            cachePolicy="disk"
          />
          <LinearGradient
            // Two stops: a scrim over the whole blur so text is legible on a
            // pale cover, then the fade into the page.
            colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0.15)", "transparent"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["transparent", String(PlatformColor("systemBackground"))]}
            locations={[0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      <View style={styles.row}>
        <Cover imageId={game.coverImageId} size="big" width={COVER_WIDTH} />

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={3}>
            {game.name}
          </Text>
          {developer === null ? null : <Text style={styles.developer}>{developer}</Text>}
          {meta === null ? null : <Text style={styles.meta}>{meta}</Text>}
          {rating === null ? null : <Text style={styles.meta}>{rating}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 8 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  row: { flexDirection: "row", gap: 16, paddingHorizontal: 16, paddingBottom: 16 },
  info: { flex: 1, gap: 4, justifyContent: "flex-end", paddingBottom: 4 },
  name: { ...Type.title2, color: PlatformColor("label") },
  developer: { ...Type.headline, color: PlatformColor("label") },
  meta: { ...Type.subheadline, color: PlatformColor("secondaryLabel") },
});
```

If `String(PlatformColor(...))` does not yield a usable colour for the gradient,
substitute the two literal values `"#FFFFFF"` / `"#000000"` selected by
`useColorScheme()` in this one place, and note it in a comment. This is the only
place in the app where a dynamic colour must be flattened to a string, because
`expo-linear-gradient` takes colour strings rather than a `ColorValue`.

- [ ] **Step 2: Create the action trio**

`apps/mobile/src/features/game/entry-actions.tsx`:

```tsx
import { Button, Host, HStack, Menu, Picker, Text } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  clipShape,
  controlSize,
  disabled,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { RATING_MAX, RATING_MIN, type BacklogEntryWire, type BacklogStatus } from "@repo/contracts";
import { StyleSheet } from "react-native";

import { STATUS_ORDER } from "@/features/backlog/sections";
import { ratingButtonLabel, statusButtonLabel, statusLabel } from "@/features/game/format";
import { Brand } from "@/theme";
import { GLASS_PROMINENT_STYLE, GLASS_STYLE } from "@/ui/platform-glass";

const NO_RATING = 0;
const RATINGS = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i);

/**
 * Apple Music's geometry: secondary circular, primary capsule, secondary
 * circular. The status capsule is the one control you cannot miss and it
 * doubles as the add affordance, so an untracked game has an obvious primary
 * action.
 *
 * Every change writes immediately. `PUT` is a full replace of a two-field
 * resource and the client always holds both fields, so a Save button would add
 * a dirty-state concept for nothing — the same reasoning that made `PUT` the
 * only write verb on the API.
 */
export function EntryActions({
  entry,
  onUpsert,
  onRemove,
}: {
  entry: BacklogEntryWire | null;
  onUpsert: (input: { status: BacklogStatus; rating: number | null }) => void;
  onRemove: () => void;
}) {
  const status = entry?.status ?? null;
  const rating = entry?.rating ?? null;

  return (
    <Host style={styles.host} matchContents={{ vertical: true }} seedColor={Brand.tint}>
      <HStack spacing={12}>
        <Menu
          label={`★ ${ratingButtonLabel(rating)}`.trim()}
          modifiers={[
            buttonStyle(GLASS_STYLE),
            controlSize("large"),
            clipShape("capsule"),
            // A rating cannot exist without a status: PUT requires one.
            disabled(status === null),
          ]}
        >
          <Picker
            selection={rating ?? NO_RATING}
            onSelectionChange={(selection) => {
              if (status === null) return;
              onUpsert({
                status,
                rating: selection === NO_RATING ? null : Number(selection),
              });
            }}
            modifiers={[pickerStyle("inline")]}
          >
            <Text modifiers={[tag(NO_RATING)]}>No rating</Text>
            {RATINGS.map((value) => (
              <Text key={value} modifiers={[tag(value)]}>
                {String(value)}
              </Text>
            ))}
          </Picker>
        </Menu>

        <Menu
          label={statusButtonLabel(status)}
          systemImage={status === null ? "plus" : "play.fill"}
          modifiers={[
            buttonStyle(GLASS_PROMINENT_STYLE),
            controlSize("large"),
            clipShape("capsule"),
          ]}
        >
          <Picker
            selection={status ?? ""}
            onSelectionChange={(selection) =>
              onUpsert({ status: selection as BacklogStatus, rating })
            }
            modifiers={[pickerStyle("inline")]}
          >
            {STATUS_ORDER.map((value) => (
              <Text key={value} modifiers={[tag(value)]}>
                {statusLabel(value)}
              </Text>
            ))}
          </Picker>
        </Menu>

        {status === null ? null : (
          <Menu
            label=""
            systemImage="ellipsis"
            modifiers={[buttonStyle(GLASS_STYLE), controlSize("large"), clipShape("capsule")]}
          >
            <Button role="destructive" label="Remove from Backlog" onPress={onRemove} />
          </Menu>
        )}
      </HStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { paddingHorizontal: 16, paddingBottom: 16, alignItems: "center" },
});
```

- [ ] **Step 3: Create the expandable summary**

`apps/mobile/src/features/game/expandable-summary.tsx`:

```tsx
import { useState } from "react";
import { PlatformColor, Pressable, StyleSheet, Text, View } from "react-native";

import { Type } from "@/theme";

const COLLAPSED_LINES = 3;

/**
 * Stays React Native rather than becoming a SwiftUI `DisclosureGroup`: this is
 * body content, not a control (composition rule, §3 of the design).
 */
export function ExpandableSummary({ summary }: { summary: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.text} numberOfLines={expanded ? undefined : COLLAPSED_LINES}>
        {summary}
      </Text>
      <Pressable onPress={() => setExpanded((value) => !value)} accessibilityRole="button">
        <Text style={styles.more}>{expanded ? "LESS" : "MORE"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 20, gap: 4 },
  text: { ...Type.body, color: PlatformColor("label") },
  more: { ...Type.footnote, fontWeight: "700", color: PlatformColor("link") },
});
```

- [ ] **Step 4: Create the detail rows**

`apps/mobile/src/features/game/detail-rows.tsx`:

```tsx
import type { GameDetailResponse } from "@repo/contracts";
import { PlatformColor, StyleSheet, Text, View } from "react-native";

import { releaseDateLine } from "@/features/game/format";
import { Type } from "@/theme";

const join = (refs: { name: string }[]): string | null =>
  refs.length === 0 ? null : refs.map((ref) => ref.name).join(", ");

const platformNames = (platforms: { name: string; abbreviation: string | null }[]) =>
  platforms.length === 0 ? null : platforms.map((p) => p.abbreviation ?? p.name).join(", ");

export function DetailRows({ game }: { game: GameDetailResponse }) {
  const rows: { label: string; value: string | null }[] = [
    { label: "Released", value: releaseDateLine(game.firstReleaseDate) },
    { label: "Type", value: game.gameType?.name ?? null },
    { label: "Genres", value: join(game.genres) },
    { label: "Platforms", value: platformNames(game.platforms) },
    { label: "Developers", value: join(game.developers) },
    { label: "Publishers", value: join(game.publishers) },
  ];

  return (
    <View style={styles.group}>
      {rows
        .filter((row): row is { label: string; value: string } => row.value !== null)
        .map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>{row.value}</Text>
          </View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginHorizontal: 16,
    marginBottom: 32,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
  row: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PlatformColor("separator"),
  },
  label: { ...Type.body, color: PlatformColor("secondaryLabel"), width: 96 },
  value: { ...Type.body, color: PlatformColor("label"), flex: 1, textAlign: "right" },
});
```

- [ ] **Step 5: Assemble the screen**

`apps/mobile/src/features/game/game-detail-screen.tsx`:

```tsx
import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { FlatList, PlatformColor, ScrollView, StyleSheet, View } from "react-native";

import { useDeleteBacklogEntry, useGame, useUpsertBacklogEntry } from "@/api/hooks";
import { QueryBoundary } from "@/components/query-boundary";
import { DetailRows } from "@/features/game/detail-rows";
import { EntryActions } from "@/features/game/entry-actions";
import { ExpandableSummary } from "@/features/game/expandable-summary";
import { Hero } from "@/features/game/hero";
import { screenshotUrl } from "@/igdb-image";

const SHOT_WIDTH = 280;

export function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = Number(id);
  const game = useGame(gameId);
  const upsert = useUpsertBacklogEntry(gameId);
  const remove = useDeleteBacklogEntry(gameId);

  return (
    <>
      {/* Transparent so the hero backdrop runs under the nav bar. Only the back
          button lives here — the ellipsis menu is in the hero trio, and a
          second one up here would be two menus doing one job. */}
      <Stack.Header transparent />
      <Stack.Title>{game.data?.name ?? ""}</Stack.Title>

      <QueryBoundary query={game}>
        {(data) => (
          <ScrollView
            style={styles.scroll}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
          >
            <Hero game={data} />

            <EntryActions
              entry={data.backlogEntry}
              onUpsert={(input) => upsert.mutate(input)}
              onRemove={() => remove.mutate()}
            />

            {data.summary === null ? null : <ExpandableSummary summary={data.summary} />}

            {data.screenshots.length === 0 ? null : (
              <FlatList
                horizontal
                style={styles.shots}
                contentContainerStyle={styles.shotsContent}
                data={data.screenshots}
                keyExtractor={(imageId) => imageId}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View style={styles.shot}>
                    <Image
                      source={{ uri: screenshotUrl(item) }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="disk"
                    />
                  </View>
                )}
              />
            )}

            <DetailRows game={data} />
          </ScrollView>
        )}
      </QueryBoundary>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: PlatformColor("systemBackground") },
  shots: { marginBottom: 24 },
  shotsContent: { paddingHorizontal: 16, gap: 12 },
  shot: {
    width: SHOT_WIDTH,
    height: SHOT_WIDTH * (9 / 16),
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: PlatformColor("secondarySystemGroupedBackground"),
  },
});
```

- [ ] **Step 6: Point all three routes at it**

Replace the body of each of `app/(tabs)/(home)/game/[id].tsx`,
`app/(tabs)/explore/game/[id].tsx` and `app/(tabs)/search/game/[id].tsx` with
exactly:

```tsx
export { GameDetailScreen as default } from "@/features/game/game-detail-screen";
```

Three files rather than one root-level route is what keeps the push inside its
tab, so the native tab bar stays visible and each tab keeps its own back
history.

- [ ] **Step 7: Exercise it on device**

Run: `pnpm --filter mobile ios`
Verify:

1. Tapping a row from each of the three tabs pushes the detail screen **inside**
   that tab, with the tab bar still visible and a back button in the nav bar.
2. The backdrop is the blurred cover, fading into the page. Check a pale cover,
   a dark cover, and a game with **no** cover (no grey smear — just a flat
   background).
3. An untracked game shows **+ Add to Backlog** as a prominent capsule, the star
   button disabled, and no ellipsis.
4. Picking a status adds the entry immediately; the capsule label changes
   without a visible reload; the star button becomes enabled and the ellipsis
   appears.
5. Setting a rating persists; reopening the screen shows it.
6. Remove from Backlog reverts the trio to the untracked state.
7. Going back to Home shows the entry in the right section with the right
   subtitle — the mutation invalidated the list.
8. The summary truncates at three lines and MORE expands it.
9. Screenshots scroll horizontally.
10. On a device running iOS below 26, the buttons render as bordered capsules
    rather than unstyled.

- [ ] **Step 8: Verify and commit**

Run: `pnpm lint && pnpm check-types && pnpm test`
Expected: PASS across the whole repo.

```bash
git add apps/mobile/src/features/game apps/mobile/src/app
git commit -m "feat(mobile): game detail with hero, backdrop and entry actions

Cover left, info right — game covers are 3:4 portrait, so Apple Music's centred
arrangement would waste vertical space. The backdrop is the cover blurred and
faded into the page, which is what makes every game screen look different; a
game with no cover gets no blur layer rather than a grey smear.

The action trio autosaves. PUT is a full replace of a two-field resource and
the client always holds both, so a Save button would add a dirty-state concept
for nothing."
```

---

## Task 19: Documentation

**Files:**

- Modify: `README.md`, `docs/superpowers/specs/2026-08-25-barklog-api-design.md`

- [ ] **Step 1: Mark the build order complete**

In `docs/superpowers/specs/2026-08-25-barklog-api-design.md` §16, change step 7
from `**Remaining** — Wire the mobile app.` to:

```markdown
7. **Done** — Wire the mobile app.
```

And append to that section's **Status** subsection:

```markdown
Step 7 was delivered by
`docs/superpowers/plans/2026-08-27-barklog-mobile.md`, against
`docs/superpowers/specs/2026-08-27-barklog-mobile-design.md`. The Expo app now
runs the full surface of §8 behind Clerk's native `AuthView`.

Two things that document does not anticipate:

- **`@repo/contracts` grew the wire contract.** The four `*Wire` interfaces and
  the response envelopes moved out of `apps/api/src/serialize.ts` so the app
  could import them without a Node dependency.
- **§14's mobile variables are now two, not one.** `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
  joins `EXPO_PUBLIC_API_URL`, and it must be the same Clerk instance as the
  API's `CLERK_SECRET_KEY`.
```

- [ ] **Step 2: Document running the app**

In `README.md`, add to the development section:

````markdown
### Mobile

The app needs a development build — `@clerk/expo`'s native components and
`@expo/ui` are native modules, so Expo Go cannot run it.

One-time setup:

1. Enable **Sign In with Apple** on the App ID `gg.barklog.app` in the Apple
   Developer portal.
2. In the Clerk Dashboard, add the iOS app under **Native Applications** (Apple
   Team ID + bundle id) and enable **Apple** under SSO connections.
3. Create `apps/mobile/.env` from `.env.example`. `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
   must be the same Clerk instance as the API's `CLERK_SECRET_KEY`, or every
   request is a 401.

Then:

```bash
pnpm deps:up                      # Postgres + Valkey
pnpm --filter api dev             # the API on :3000
pnpm --filter mobile prebuild     # after any config-plugin change
pnpm --filter mobile ios
```

On a physical device set `EXPO_PUBLIC_API_URL` to the host machine's LAN IP —
`localhost` resolves to the phone.
````

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-08-25-barklog-api-design.md
git commit -m "docs: record step 7 delivered and how to run the app

Notes the two things the API design did not anticipate: @repo/contracts grew
the wire contract, and the mobile app now needs two environment variables
rather than one."
```

---

## Self-Review

**Spec coverage.** Every section of the design maps to a task: §2 decisions are
distributed throughout; §3 composition rule is in Global Constraints and Tasks
14–18; §4 dependencies and native config in Task 2, prerequisites in Task 0; §5
environment in Tasks 0 and 2; §6 wire contract in Task 1; §7 route tree in Task
10 and Task 18 step 6; §8 authentication in Tasks 8 and 9; §9 transport in Tasks
5–7; §10 data layer in Tasks 9 and 15; §11.0 header in Task 10; §11.1 Home in
Tasks 12, 13 and 15; §11.2 Explore in Task 16; §11.3 Search in Task 17; §11.4
game detail in Tasks 11 and 18; §12 shared components in Task 14; §13 testing in
Tasks 2–8 and 11–13; §14 build order is this plan's task order; §15 risks are
verified in the on-device steps of Tasks 9, 15, 17 and 18; §16 deferred items are
deliberately absent.

**Known deviations from the design, recorded rather than hidden.**

- The design lists `SyncStatusResponse` nowhere and this plan declares no such
  type — `/api/sync/status` has no consumer in the app.
- The design's §11.2 implies Explore rows could carry genres. They cannot:
  `GameSummaryWire` is the summary projection and has no `genres` field, so
  Explore and Search subtitles show the release year only. Tasks 16 and 17 say so
  in a comment at the call site.
- The design's §13 table lists a `keys.test.ts` and this plan adds
  `api-endpoints.test.ts` alongside it, which the design does not name. More
  coverage than specified, in the layer the design itself calls the most likely
  to be wrong.
- `useDebounced` has no unit test: it is a React hook, and testing it would mean
  adding a renderer that the design explicitly rules out. Verified on device in
  Task 17 step 4.

**Type consistency.** `Request` (Task 6) is consumed by `createEndpoints` (Task
7). `Endpoints` (Task 7) is what `useApi()` returns (Task 9) and what every hook
consumes (Task 15). `keys` (Task 7) is used by the hooks (Task 15) and nowhere
else. `BacklogSection.title: string | null` (Task 12) is what
`renderSectionHeader` branches on (Task 15). `statusLabel` (Task 11) is imported
by `sections.ts` (Task 12) and `status-filter.tsx` (Task 15). `GLASS_STYLE` and
`GLASS_PROMINENT_STYLE` (Task 4) are used in Tasks 14 and 18. `EmptyState.systemImage`
is typed `SFSymbol` (Task 13) to match `NativeState`'s prop (Task 14).
`coverUrl(imageId, size)` (Task 3) has the same two-argument shape everywhere it
is called (Tasks 14 and 18).
