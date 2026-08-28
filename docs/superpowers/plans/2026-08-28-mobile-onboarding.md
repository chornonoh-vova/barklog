# Mobile Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show four explanatory pages to a first-time install before the Clerk auth gate, dismissable at any point, never shown twice.

**Architecture:** A new `OnboardingGate` component wraps `AuthGate` in the root layout, so the pages render before anything requires an account. Whether to show them is a pure function of two inputs (a persisted device flag and Clerk's session state) living in its own module, unit-tested in Node. The pages themselves are a SwiftUI `TabView` in page style, so iOS supplies the swipe and the dot indicators.

**Tech Stack:** Expo SDK 57, expo-router 57 (`Slot`, no route changes), `@expo/ui/swift-ui` (SwiftUI components), `@clerk/expo` 4, `@react-native-async-storage/async-storage` (new), Vitest 4 in Node.

**Spec:** `docs/superpowers/specs/2026-08-28-mobile-onboarding-design.md`

## Global Constraints

- Read the exact versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo API call. This is `apps/mobile/AGENTS.md` and it is not optional.
- All commands run from the repo root unless stated. Mobile scripts are `pnpm --filter mobile <script>`.
- `@repo/typescript-config` sets `strict` **and** `noUncheckedIndexedAccess: true`. Any computed array index is `T | undefined` and must be narrowed, never asserted with `!`.
- `apps/mobile/vitest.config.mts` runs `test/**/*.test.ts` in plain Node with **no** react-native transform. Anything imported by a test must be free of `react-native` and `@expo/ui` imports. Type-only imports are fine.
- Tests live in `apps/mobile/test/`, flat, kebab-case, `.test.ts`. Source is reached via the `@/` alias only.
- `Brand.tint` in `src/theme.ts` is the only hex literal permitted in the app. Every other colour comes from `PlatformColor` or a SwiftUI hierarchical style.
- Button styles come from `GLASS_STYLE` / `GLASS_PROMINENT_STYLE` in `src/ui/platform-glass.ts`, never a hardcoded `"glass"`.
- Page titles are the repo owner's exact wording and must not be re-edited: "Welcome to Barklog", "Managing your game backlog", "Exploring games", "All game data is powered by IGDB".
- Page descriptions are given verbatim in Task 3. Do not improve them.
- `pnpm --filter mobile check-types` and `pnpm --filter mobile lint` (`--max-warnings 0`) must pass before every commit.
- No task in this plan may run the iOS app. Every native behaviour goes on `docs/mobile-device-verification.md` instead (Task 7).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/src/igdb-url.ts` | **Modify.** Gains `siteUrl()` beside `gameUrl()`, so the IGDB base URL stays declared once. |
| `apps/mobile/src/onboarding/should-show-onboarding.ts` | **Create.** The entire show/skip policy as one pure function. No imports. |
| `apps/mobile/src/onboarding/storage.ts` | **Create.** The AsyncStorage read/write pair, and the only file that knows the storage key. |
| `apps/mobile/src/onboarding/onboarding-gate.tsx` | **Create.** Wires storage + Clerk + splash to the policy and picks what to render. |
| `apps/mobile/src/features/onboarding/pages.ts` | **Create.** The four pages' copy and symbols. Type-only imports, so it is testable in Node. |
| `apps/mobile/src/features/onboarding/onboarding-screen.tsx` | **Create.** The SwiftUI pager and its two buttons. Presentation only; takes `onComplete`. |
| `apps/mobile/src/app/_layout.tsx` | **Modify.** Mounts `OnboardingGate` around `AuthGate`, and takes over `preventAutoHideAsync()`. |
| `apps/mobile/src/auth/auth-gate.tsx` | **Modify.** Loses its module-scope `preventAutoHideAsync()` line only. |
| `apps/mobile/test/igdb-url.test.ts` | **Modify.** `siteUrl()` case. |
| `apps/mobile/test/onboarding-decision.test.ts` | **Create.** Every row of the policy table. |
| `apps/mobile/test/onboarding-pages.test.ts` | **Create.** Copy invariants, including that page 2 still names all four backlog statuses. |
| `docs/mobile-device-verification.md` | **Modify.** Checks 19-23. |

Gate logic sits beside `src/auth/` and the screen under `src/features/`, which is the split the app already uses (`auth-gate.tsx` + `should-clear-cache.ts` vs `features/explore/`).

---

## Task 1: `siteUrl()` for the IGDB site root

The last page links to igdb.com itself, not to a game. `src/igdb-url.ts` already owns the base URL and must keep owning it.

**Files:**
- Modify: `apps/mobile/src/igdb-url.ts`
- Test: `apps/mobile/test/igdb-url.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `siteUrl(): string` returning `"https://www.igdb.com"`. Task 5 imports it as `import { siteUrl } from "@/igdb-url"`.

- [ ] **Step 1: Write the failing test**

Append to `apps/mobile/test/igdb-url.test.ts`. Keep the existing `gameUrl` describe block untouched, and add the import:

```ts
import { describe, expect, it } from "vitest";

import { gameUrl, siteUrl } from "@/igdb-url";
```

then, after the existing block:

```ts
describe("siteUrl", () => {
  it("is the igdb.com root the onboarding attribution links to", () => {
    expect(siteUrl()).toBe("https://www.igdb.com");
  });

  it("shares its base with gameUrl", () => {
    expect(gameUrl("hollow-knight-silksong").startsWith(siteUrl())).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter mobile test -- igdb-url
```

Expected: FAIL. TypeScript/Vitest reports `siteUrl is not a function` (or an unresolved export).

- [ ] **Step 3: Write the minimal implementation**

In `apps/mobile/src/igdb-url.ts`, add below `gameUrl`:

```ts
/**
 * The site root, for the onboarding page that credits IGDB as the source of
 * every field in the app rather than of one game.
 */
export function siteUrl(): string {
  return BASE;
}
```

A function rather than exporting `BASE` directly: it keeps the constant private and matches `gameUrl`'s shape, so callers never learn whether the base is composed or literal.

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter mobile test -- igdb-url
pnpm --filter mobile check-types
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/igdb-url.ts apps/mobile/test/igdb-url.test.ts
git commit -m "feat(mobile): igdb site root url"
```

---

## Task 2: The show/skip policy

The whole decision, as one pure function, for the same reason `should-clear-cache.ts` exists: the interesting cases are unreachable in a simulator.

**Files:**
- Create: `apps/mobile/src/onboarding/should-show-onboarding.ts`
- Test: `apps/mobile/test/onboarding-decision.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type OnboardingDecision = "pending" | "show" | "complete";
  export function onboardingDecision(
    hasSeen: boolean | undefined,
    isSignedIn: boolean | undefined,
  ): OnboardingDecision;
  ```
  Task 6 imports both from `./should-show-onboarding`.

The policy, which the test below encodes row for row:

| `hasSeen` | `isSignedIn` | Result |
|---|---|---|
| `undefined` (read in flight) | anything | `pending` |
| `true` | anything | `complete` |
| `false` | `undefined` (Clerk not loaded) | `pending` |
| `false` | `true` | `complete` |
| `false` | `false` | `show` |

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/test/onboarding-decision.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { onboardingDecision } from "@/onboarding/should-show-onboarding";

describe("onboardingDecision", () => {
  it("waits while the stored flag is still being read", () => {
    // The splash is still up at this point, so rendering nothing costs nothing.
    expect(onboardingDecision(undefined, undefined)).toBe("pending");
    expect(onboardingDecision(undefined, false)).toBe("pending");
    expect(onboardingDecision(undefined, true)).toBe("pending");
  });

  it("goes straight through when onboarding has been seen", () => {
    // The hot path on every launch after the first. It must not wait on Clerk,
    // or the splash is held longer than it is today for no reason.
    expect(onboardingDecision(true, undefined)).toBe("complete");
    expect(onboardingDecision(true, false)).toBe("complete");
    expect(onboardingDecision(true, true)).toBe("complete");
  });

  it("waits for Clerk before showing onboarding to an unflagged install", () => {
    // Without this the reinstalling user whose session is still in the keychain
    // sees a frame of onboarding before the auto-complete below fires.
    expect(onboardingDecision(false, undefined)).toBe("pending");
  });

  it("auto-completes for a signed-in user with no stored flag", () => {
    // A reinstall: AsyncStorage went with the app container, the Clerk session
    // did not. Someone with an account has already seen the pitch.
    expect(onboardingDecision(false, true)).toBe("complete");
  });

  it("shows onboarding on a genuine first run", () => {
    expect(onboardingDecision(false, false)).toBe("show");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter mobile test -- onboarding-decision
```

Expected: FAIL — cannot resolve `@/onboarding/should-show-onboarding`.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/mobile/src/onboarding/should-show-onboarding.ts`:

```ts
/**
 * Pure and named so it is testable: the two cases that matter — a reinstall
 * whose Clerk session outlived its AsyncStorage, and a storage read still in
 * flight — are both awkward to reach in a simulator and easy to get wrong.
 *
 * `undefined` means "not yet known" for both inputs, never "no". `hasSeen` is
 * unknown until AsyncStorage answers; `isSignedIn` is unknown until Clerk has
 * read the keychain.
 */
export type OnboardingDecision =
  /** Render nothing. The splash is still up. */
  | "pending"
  /** Render the pages. */
  | "show"
  /** Hand off to the auth gate. */
  | "complete";

export function onboardingDecision(
  hasSeen: boolean | undefined,
  isSignedIn: boolean | undefined,
): OnboardingDecision {
  if (hasSeen === undefined) return "pending";

  // Deliberately before the Clerk check: the common launch must not be held
  // waiting on a session state it does not need.
  if (hasSeen) return "complete";

  if (isSignedIn === undefined) return "pending";

  // An existing session means an existing account, and nobody makes an account
  // without having seen what the app is. The caller persists this.
  return isSignedIn ? "complete" : "show";
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter mobile test -- onboarding-decision
pnpm --filter mobile check-types
pnpm --filter mobile lint
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/onboarding/should-show-onboarding.ts apps/mobile/test/onboarding-decision.test.ts
git commit -m "feat(mobile): onboarding show/skip policy"
```

---

## Task 3: The four pages' copy

Copy in its own module, typed and tested, for the same reason `features/backlog/empty-states.ts` is: it can then be checked against the contracts it describes.

**Files:**
- Create: `apps/mobile/src/features/onboarding/pages.ts`
- Test: `apps/mobile/test/onboarding-pages.test.ts`

**Interfaces:**
- Consumes: `SFSymbol` type from `sf-symbols-typescript` (a devDependency, types only — safe in Node tests).
- Produces:
  ```ts
  export interface OnboardingPage {
    id: string;
    systemImage: SFSymbol;
    title: string;
    description: string;
  }
  // a readonly 4-tuple, NOT a plain array — see the note below
  export const ONBOARDING_PAGES: readonly [OnboardingPage, OnboardingPage, OnboardingPage, OnboardingPage];
  export const IGDB_PAGE_ID = "igdb";
  ```
  Task 5 imports `ONBOARDING_PAGES` and `IGDB_PAGE_ID` from `./pages`.

`ONBOARDING_PAGES` must be a tuple, not an array. `@repo/typescript-config` sets `noUncheckedIndexedAccess: true`, so indexing a plain array yields `OnboardingPage | undefined` and Task 5's `ONBOARDING_PAGES[0].id` would not compile. Declaring it `as const satisfies readonly OnboardingPage[]` — the same shape `src/features/explore/shelves.ts` uses for `SHELVES` — keeps the literal length, and a known tuple index is exempt from that flag.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/test/onboarding-pages.test.ts`:

```ts
import { BACKLOG_STATUSES } from "@repo/contracts";
import { describe, expect, it } from "vitest";

import { IGDB_PAGE_ID, ONBOARDING_PAGES } from "@/features/onboarding/pages";

describe("ONBOARDING_PAGES", () => {
  it("is the four pages, in the agreed order", () => {
    expect(ONBOARDING_PAGES.map((page) => page.title)).toEqual([
      "Welcome to Barklog",
      "Managing your game backlog",
      "Exploring games",
      "All game data is powered by IGDB",
    ]);
  });

  it("gives every page a unique id", () => {
    const ids = ONBOARDING_PAGES.map((page) => page.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every page copy to show", () => {
    for (const page of ONBOARDING_PAGES) {
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.description.length).toBeGreaterThan(0);
      expect(page.systemImage.length).toBeGreaterThan(0);
    }
  });

  it("ends on the IGDB attribution", () => {
    // The last page carries the igdb.com link and the primary button says
    // "Start" there, both keyed on it being last.
    expect(ONBOARDING_PAGES.at(-1)?.id).toBe(IGDB_PAGE_ID);
  });

  it("names every real backlog status on the backlog page", () => {
    // The point of this test: rename a status in @repo/contracts and this fails,
    // rather than leaving onboarding describing an app that no longer exists.
    const page = ONBOARDING_PAGES.find((candidate) => candidate.id === "backlog");

    expect(page).toBeDefined();

    for (const status of BACKLOG_STATUSES) {
      expect(page?.description.toLowerCase()).toContain(status);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter mobile test -- onboarding-pages
```

Expected: FAIL — cannot resolve `@/features/onboarding/pages`.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/mobile/src/features/onboarding/pages.ts`. The descriptions are final; do not reword them.

```ts
import type { SFSymbol } from "sf-symbols-typescript";

/**
 * Copy in its own module, with no react-native or @expo/ui import anywhere in
 * its graph, so `test/onboarding-pages.test.ts` can check it against
 * `BACKLOG_STATUSES` in plain Node. `SFSymbol` is a type, so it erases.
 */
export interface OnboardingPage {
  /** Also the `TabView.Tab` value, so it must be stable and unique. */
  id: string;
  systemImage: SFSymbol;
  title: string;
  description: string;
}

/** The page that carries the igdb.com link and the final "Start" button. */
export const IGDB_PAGE_ID = "igdb";

/**
 * `as const satisfies` rather than a plain annotation: the tuple keeps its
 * literal length, which is what lets `onboarding-screen.tsx` index `[0]` for its
 * initial selection without a non-null assertion.
 *
 * Titles are the repo owner's wording. The third page's three items are the
 * three `SHELVES` feeds in `features/explore/shelves.ts`, paraphrased.
 */
export const ONBOARDING_PAGES = [
  {
    id: "welcome",
    systemImage: "pawprint.fill",
    title: "Welcome to Barklog",
    description:
      "Barklog holds the games you're playing and the ones you keep meaning to start.",
  },
  {
    id: "backlog",
    systemImage: "checklist",
    title: "Managing your game backlog",
    description:
      "Add a game, then mark it waiting, playing, completed, or abandoned. Abandoned is a real answer.",
  },
  {
    id: "explore",
    systemImage: "sparkle.magnifyingglass",
    title: "Exploring games",
    description:
      "See what's popular, what's coming out, and what just landed. Or search by name if you already know what you want.",
  },
  {
    id: IGDB_PAGE_ID,
    systemImage: "books.vertical.fill",
    title: "All game data is powered by IGDB",
    description:
      "Every cover, release date, platform, and summary in Barklog comes from IGDB, a games database its community maintains.",
  },
] as const satisfies readonly OnboardingPage[];
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm --filter mobile test -- onboarding-pages
pnpm --filter mobile check-types
pnpm --filter mobile lint
```

Expected: all PASS. If `check-types` rejects a symbol name, that symbol does not exist in `sf-symbols-typescript` 2.2.0 — pick the nearest real one and note the substitution in the commit message rather than casting.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/onboarding/pages.ts apps/mobile/test/onboarding-pages.test.ts
git commit -m "feat(mobile): onboarding page copy"
```

---

## Task 4: The persisted flag

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`, do not hand-edit)
- Create: `apps/mobile/src/onboarding/storage.ts`

**Interfaces:**
- Consumes: `@react-native-async-storage/async-storage` default export.
- Produces:
  ```ts
  export async function readHasSeenOnboarding(): Promise<boolean>;
  export async function markOnboardingSeen(): Promise<void>;
  ```
  Task 6 imports both from `./storage`. Neither ever rejects.

Unit-tested with a `vi.mock` factory for `@react-native-async-storage/async-storage`, so the real module — which transitively requires react-native — is never loaded. That covers the three read outcomes (missing, present, throws) and the one contract Task 6 depends on, that a write failure resolves rather than rejects; see `apps/mobile/test/onboarding-storage.test.ts`. The device checklist (Task 7, checks 19 and 22) still covers what only the real native module can show.

- [ ] **Step 1: Install the dependency**

```bash
cd apps/mobile && npx expo install @react-native-async-storage/async-storage && cd -
```

`expo install` picks the version matching SDK 57; `pnpm add` may not. Confirm it landed in `apps/mobile/package.json` `dependencies`.

- [ ] **Step 2: Write the implementation**

Create `apps/mobile/src/onboarding/storage.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * AsyncStorage, not `expo-secure-store`: this is not a secret, and SecureStore's
 * keychain entries outlive an uninstall. The flag living in the app container is
 * the point — a reinstall shows onboarding again, which is exactly what the Skip
 * button is for.
 */
const KEY = "barklog.onboarding.seen";

/**
 * A failed read resolves to `true`, which is the opposite of the obvious
 * default. If storage is broken then the write in `markOnboardingSeen` fails
 * too, so a `false` here would show onboarding on every launch with no way to
 * get past it. Missing an optional flow beats being trapped in one.
 */
export async function readHasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) !== null;
  } catch {
    return true;
  }
}

/**
 * Swallows failures. Seeing onboarding once more next launch is an annoyance; an
 * unhandled rejection between the last page and the auth gate is not.
 */
export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, "1");
  } catch {
    // Intentionally ignored, per the doc comment.
  }
}
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
pnpm --filter mobile check-types
pnpm --filter mobile lint
pnpm --filter mobile test
```

Expected: all PASS. The full test run confirms the new dependency has not leaked into the Node test graph.

- [ ] **Step 4: Regenerate the native project**

```bash
pnpm --filter mobile prebuild
```

AsyncStorage is an autolinked native module, so the existing `ios/` build does not contain it. Skipping this makes the app crash at launch with an unresolved native module, and the crash looks nothing like a missing dependency.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/onboarding/storage.ts
git commit -m "feat(mobile): persist the onboarding-seen flag"
```

`apps/mobile/ios` is gitignored (`apps/mobile/.gitignore:42`, 0 tracked files), so the regenerated native project is deliberately not committed. Do not stage it, and do not add it to `.gitignore` exceptions.

---

## Task 5: The pager

**Files:**
- Create: `apps/mobile/src/features/onboarding/onboarding-screen.tsx`

**Interfaces:**
- Consumes: `ONBOARDING_PAGES`, `IGDB_PAGE_ID` (Task 3); `siteUrl()` (Task 1); `GLASS_PROMINENT_STYLE` from `@/ui/platform-glass`; `Brand` from `@/theme`.
- Produces: `OnboardingScreen({ onComplete }: { onComplete: () => void })`. Task 6 renders it. It holds no persistence and no auth knowledge — `onComplete` fires for both Skip and the final button, and the gate decides what that means.

Read https://docs.expo.dev/versions/v57.0.0/sdk/ui/ before starting. Two facts this task depends on, both verified against `node_modules/@expo/ui/build/swift-ui/` in this SDK:

- `tabViewStyle` and `indexViewStyle` are exported from `@expo/ui/swift-ui/modifiers` (via `modifiers/tabViewModifiers`), alongside the modifiers `empty-state.tsx` already uses.
- `tabViewStyle({ type: "page", indexDisplayMode: "always" })` is what makes `TabView` a swipeable pager with dots instead of a bottom tab bar.

- [ ] **Step 1: Write the implementation**

Create `apps/mobile/src/features/onboarding/onboarding-screen.tsx`:

```tsx
import { Button, Host, HStack, Image, Label, Link, Spacer, TabView, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  buttonStyle,
  controlSize,
  fixedSize,
  font,
  foregroundStyle,
  frame,
  hidden,
  multilineTextAlignment,
  padding,
  tabViewStyle,
} from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { siteUrl } from "@/igdb-url";
import { Brand } from "@/theme";
import { GLASS_PROMINENT_STYLE } from "@/ui/platform-glass";

import { IGDB_PAGE_ID, ONBOARDING_PAGES } from "./pages";

/**
 * A SwiftUI `TabView` in page style, so the swipe gesture and the dot indicators
 * are UIKit's rather than ours. `selection` is controlled because the bottom
 * button both advances the pager and changes its own label on the last page.
 *
 * Presentation only. `onComplete` covers Skip and the final button alike; the
 * gate above decides what completing means.
 */
export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [selection, setSelection] = useState<string>(ONBOARDING_PAGES[0].id);

  // `Math.max(0, …)`: a selection the native view reports for a page we do not
  // have would otherwise index off the front of the array.
  const index = Math.max(
    0,
    ONBOARDING_PAGES.findIndex((page) => page.id === selection),
  );
  const isLast = index === ONBOARDING_PAGES.length - 1;

  // `noUncheckedIndexedAccess` is on, so a computed index is `| undefined`.
  // Reading it once and branching on the result is both typesafe and the whole
  // of the button's behaviour: no next page means this one completes.
  const advance = () => {
    const next = ONBOARDING_PAGES[index + 1];

    if (next) setSelection(next.id);
    else onComplete();
  };

  return (
    <Host style={styles.host} seedColor={Brand.tint}>
      <VStack>
        <HStack modifiers={[padding({ horizontal: 16, top: 8 })]}>
          <Spacer />
          {/* `hidden`, not a conditional render: the row keeps its height on the
              last page, so the pages below it do not shift up under the dots. */}
          <Button
            label="Skip"
            onPress={onComplete}
            modifiers={[buttonStyle("plain"), hidden(isLast)]}
          />
        </HStack>

        <TabView
          selection={selection}
          onSelectionChange={setSelection}
          modifiers={[tabViewStyle({ type: "page", indexDisplayMode: "always" })]}
        >
          {ONBOARDING_PAGES.map((page) => (
            <TabView.Tab key={page.id} value={page.id}>
              <VStack spacing={8} modifiers={[padding({ horizontal: 32 })]}>
                <Image
                  systemName={page.systemImage}
                  size={52}
                  modifiers={[
                    foregroundStyle({ type: "hierarchical", style: "secondary" }),
                    padding({ bottom: 4 }),
                    // The symbol restates the title; VoiceOver reads the copy only.
                    accessibilityHidden(true),
                  ]}
                />
                <Text
                  modifiers={[
                    font({ textStyle: "title2", weight: "bold" }),
                    multilineTextAlignment("center"),
                  ]}
                >
                  {page.title}
                </Text>
                <Text
                  modifiers={[
                    font({ textStyle: "body" }),
                    foregroundStyle({ type: "hierarchical", style: "secondary" }),
                    multilineTextAlignment("center"),
                    frame({ maxWidth: 320 }),
                    // Wrap rather than truncate on a short host or large type.
                    fixedSize({ vertical: true }),
                  ]}
                >
                  {page.description}
                </Text>
                {page.id === IGDB_PAGE_ID ? (
                  // SwiftUI `Link` opens the URL itself, so there is no
                  // `openURL` call and no `Pressable` wrapper to get wrong.
                  <Link
                    destination={siteUrl()}
                    modifiers={[font({ textStyle: "subheadline" }), padding({ top: 8 })]}
                  >
                    <Label title="igdb.com" systemImage="arrow.up.right.square" />
                  </Link>
                ) : null}
              </VStack>
            </TabView.Tab>
          ))}
        </TabView>

        <Button
          label={isLast ? "Start" : "Continue"}
          onPress={advance}
          modifiers={[
            buttonStyle(GLASS_PROMINENT_STYLE),
            controlSize("large"),
            padding({ horizontal: 32, bottom: 24 }),
          ]}
        />
      </VStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
});
```

The React Compiler is on (`app.json` → `experiments.reactCompiler`), so do not add `useMemo` or `useCallback` here.

- [ ] **Step 2: Verify it compiles and lints**

```bash
pnpm --filter mobile check-types
pnpm --filter mobile lint
```

Expected: both PASS. This is the only verification available for this file — it renders native views, so there is nothing meaningful to assert off-device.

If `check-types` rejects `hidden(isLast)` on a `Button`, replace it with a conditional render (`{isLast ? null : <Button … />}`) and add a note to check 21 in Task 7 that the pages may shift on the last page.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/features/onboarding/onboarding-screen.tsx
git commit -m "feat(mobile): onboarding pager"
```

---

## Task 6: The gate, and moving the splash

The one task that changes existing behaviour. Read `src/auth/auth-gate.tsx` in full before editing it.

**Files:**
- Create: `apps/mobile/src/onboarding/onboarding-gate.tsx`
- Modify: `apps/mobile/src/app/_layout.tsx`
- Modify: `apps/mobile/src/auth/auth-gate.tsx:9`

**Interfaces:**
- Consumes: `onboardingDecision`, `OnboardingDecision` (Task 2); `readHasSeenOnboarding`, `markOnboardingSeen` (Task 4); `OnboardingScreen` (Task 5).
- Produces: `OnboardingGate({ children }: { children: ReactNode })`. Mounted only by `_layout.tsx`.

Why the splash has to move: `auth-gate.tsx` currently calls `SplashScreen.preventAutoHideAsync()` at module scope and hides the splash once Clerk is loaded. With onboarding in front of it, `AuthGate` does not mount during onboarding, so nothing hides the splash and the pager renders underneath it, invisible. The prevent call moves to the root layout, which runs first regardless of which gate paints; each gate then hides the splash when it paints. `hideAsync()` is idempotent, so the second call when `AuthGate` finally mounts is a no-op.

- [ ] **Step 1: Write the gate**

Create `apps/mobile/src/onboarding/onboarding-gate.tsx`:

```tsx
import { useAuth } from "@clerk/expo";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState, type ReactNode } from "react";

import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

import { onboardingDecision } from "./should-show-onboarding";
import { markOnboardingSeen, readHasSeenOnboarding } from "./storage";

/**
 * Sits outside `AuthGate` so the pages are reachable without an account by
 * construction: expo-router's routes live under the `Slot` inside `AuthGate`, so
 * onboarding could not have been a route and still come first.
 *
 * `treatPendingAsSignedOut: false` matches `AuthGate`, so a session still being
 * established does not read as signed-out and drop a returning user into
 * onboarding.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const [hasSeen, setHasSeen] = useState<boolean | undefined>(undefined);
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });

  useEffect(() => {
    let isCurrent = true;

    void readHasSeenOnboarding().then((seen) => {
      // Fast Refresh can unmount this before the read lands.
      if (isCurrent) setHasSeen(seen);
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  // `undefined` until Clerk has read the keychain: the policy treats that as
  // "not yet known", never as signed-out.
  const decision = onboardingDecision(hasSeen, isLoaded ? isSignedIn : undefined);

  useEffect(() => {
    // The reinstall case: session restored, flag gone. Persist it so the next
    // launch takes the hot path and never waits on Clerk.
    //
    // `setHasSeen(true)` as well as the write, so local state mirrors storage.
    // Without it `hasSeen` stays `false` for the rest of the session and
    // `decision` keeps depending on `isSignedIn`: a sign-out later in the same
    // session would flip the gate back to "show" and bury the sign-in screen
    // under onboarding, since this gate sits above `AuthGate`. It also makes the
    // effect self-terminating rather than relying on the deps array.
    //
    // Chained onto the write, not called directly in the effect body: the bare
    // synchronous call trips `react-hooks/set-state-in-effect`, and
    // `markOnboardingSeen` never rejects, so the `.then()` always runs.
    if (hasSeen === false && decision === "complete") {
      void markOnboardingSeen().then(() => setHasSeen(true));
    }
  }, [hasSeen, decision]);

  useEffect(() => {
    // Held open by the root layout. Whichever gate paints first hides it, and
    // that is this one whenever onboarding runs.
    if (decision === "show") void SplashScreen.hideAsync();
  }, [decision]);

  if (decision === "pending") return null;

  if (decision === "show") {
    return (
      <OnboardingScreen
        onComplete={() => {
          // Local state first: the transition into the app must not wait on a
          // write, and `markOnboardingSeen` never rejects.
          setHasSeen(true);
          void markOnboardingSeen();
        }}
      />
    );
  }

  return children;
}
```

- [ ] **Step 2: Move `preventAutoHideAsync` out of the auth gate**

In `apps/mobile/src/auth/auth-gate.tsx`, delete only this line (currently line 9) and the blank line after it:

```ts
void SplashScreen.preventAutoHideAsync();
```

Keep the `import * as SplashScreen from "expo-splash-screen";` — `hideAsync` is still used at line 39. Then extend the existing comment on the hide effect so the split is not a mystery to the next reader:

```ts
  useEffect(() => {
    // Held open until Clerk has read the keychain, so a returning user never
    // sees the sign-in screen flash. The `preventAutoHideAsync` that holds it
    // lives in `app/_layout.tsx`, because `OnboardingGate` may paint before
    // this component ever mounts and it hides the splash itself.
    if (isLoaded) void SplashScreen.hideAsync();
  }, [isLoaded]);
```

- [ ] **Step 3: Mount the gate in the root layout**

In `apps/mobile/src/app/_layout.tsx`, add the two imports:

```tsx
import * as SplashScreen from "expo-splash-screen";

import { OnboardingGate } from "@/onboarding/onboarding-gate";
```

(keeping the existing import grouping: `expo-splash-screen` with the other external packages, `@/onboarding/…` with the other `@/` imports)

Add at module scope, above `export default function RootLayout()`:

```tsx
/**
 * Here rather than in a gate: either gate below may be the first to paint, and
 * each hides the splash itself once it does. This file is the entry point, so it
 * is the one place guaranteed to run before that decision is made.
 */
void SplashScreen.preventAutoHideAsync();
```

Then wrap `AuthGate`:

```tsx
          <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
            <OnboardingGate>
              <AuthGate>
                {/* `Slot`, not `Stack`: (tabs) is the only root route, so a Stack
                    would wrap the tab controller in a UINavigationController for
                    nothing. */}
                <Slot />
              </AuthGate>
            </OnboardingGate>
            <StatusBar style="auto" />
          </ThemeProvider>
```

- [ ] **Step 4: Verify the whole suite, types and lint**

```bash
pnpm --filter mobile test
pnpm --filter mobile check-types
pnpm --filter mobile lint
```

Expected: all PASS, including the pre-existing `should-clear-cache` and `smoke` tests.

- [ ] **Step 5: Confirm exactly one `preventAutoHideAsync` remains**

```bash
grep -rn "SplashScreen\.\(preventAutoHideAsync\|hideAsync\)(" apps/mobile/src
```

Expected exactly three lines: one `preventAutoHideAsync` in `src/app/_layout.tsx`, one `hideAsync` in `src/auth/auth-gate.tsx`, one `hideAsync` in `src/onboarding/onboarding-gate.tsx`. Two prevent calls means the edit in Step 2 did not land, and the splash would then be held by a call nobody hides.

The pattern is call-shaped (`SplashScreen.` prefix, open paren) on purpose. A bare `grep -rn "preventAutoHideAsync\|hideAsync"` also matches the Step 2 comment, which names `preventAutoHideAsync` in prose, and returns four lines for a correct edit.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/onboarding/onboarding-gate.tsx apps/mobile/src/app/_layout.tsx apps/mobile/src/auth/auth-gate.tsx
git commit -m "feat(mobile): onboarding gate ahead of the auth gate"
```

---

## Task 7: Device verification checklist

Nothing in Tasks 1-6 ran the app. Six behaviours can only be confirmed on a device, and the first of them is a regression risk in code that already worked.

**Files:**
- Modify: `docs/mobile-device-verification.md`

- [ ] **Step 1: Append the checks**

Add to the end of `docs/mobile-device-verification.md`, continuing the existing numbering (the file currently ends at 18):

```markdown
## Onboarding checks

Added by `docs/superpowers/plans/2026-08-28-mobile-onboarding.md`. Check 19
first: it is the one that can regress behaviour that already worked.

- [ ] **19. A returning signed-in user still goes straight to the tabs.** This is
      check 3 again, re-run because `preventAutoHideAsync()` moved from
      `src/auth/auth-gate.tsx` to `src/app/_layout.tsx`. No onboarding, no flash
      of the sign-in screen, and above all no splash that never goes away. A
      stuck splash means the prevent call is being held by a gate that never
      paints.
- [ ] **20. A fresh install shows onboarding before the sign-in screen.** Delete
      the app from the simulator first, since that is what clears AsyncStorage.
      Four pages, swipeable, dots at the bottom.
- [ ] **21. The controls sit inside the safe area.** HIGHEST RISK of the
      cosmetic checks. `Host` is trusted to propagate the SwiftUI safe area, and
      the gate renders outside expo-router's `SafeAreaProvider`, so this is
      untested. If Skip is under the notch or the button under the home
      indicator, add a `SafeAreaProvider` at the root of `_layout.tsx` and pad
      the `Host` with `useSafeAreaInsets`. Check on a notched device.
- [ ] **22. Skip works, and stays worked.** Tap Skip on page 1, land on the
      sign-in screen, force-quit, relaunch: no onboarding. Then the same for
      swiping to page 4 and tapping Start.
- [ ] **23. The igdb.com link opens the site**, and page 4 shows the
      external-link glyph beside it.
- [ ] **24. Onboarding renders in both appearances.** Symbols and secondary text
      come from SwiftUI hierarchical styles, so light and dark should both work
      without a `useColorScheme` branch. Confirm rather than assume.
```

- [ ] **Step 2: Commit**

```bash
git add docs/mobile-device-verification.md
git commit -m "docs: device checks for mobile onboarding"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3 placement and control flow, splash move | Task 6 |
| §4 the decision | Task 2 |
| §5 storage | Task 4 |
| §6 UI, `Link`, safe-area risk | Task 5 (build), Task 7 check 21 (risk) |
| §7 copy, `siteUrl()` | Task 3, Task 1 |
| §8 files | File Structure table |
| §9 testing | Tasks 1, 2, 3 |
| §10 risks | Task 7 checks 19-21, Task 4 Step 4 (prebuild) |
| §11 deferred | Nothing to build |

No gaps.

**Placeholder scan:** No TBDs. Every code step carries the code. Task 5 and Task 6 have no unit tests, and both say why rather than deferring the question.

**Type consistency:** `onboardingDecision(hasSeen, isSignedIn)` is declared in Task 2 and called with that argument order in Task 6. `OnboardingPage` fields `id` / `systemImage` / `title` / `description` are declared in Task 3 and read with those names in Task 5. `IGDB_PAGE_ID` is exported from `pages.ts` (Task 3) and imported by both Task 3's test and Task 5. `readHasSeenOnboarding` / `markOnboardingSeen` are named identically in Tasks 4 and 6. `OnboardingScreen`'s single prop is `onComplete` in both Task 5 and Task 6. `siteUrl()` is defined in Task 1 and called in Task 5.

**Ordering:** Tasks 1-3 are pure and independently testable. Task 4 introduces the native dependency. Task 5 consumes 1 and 3. Task 6 consumes 2, 4, and 5 and is the only task that touches working code. Task 7 records what none of them could verify.
