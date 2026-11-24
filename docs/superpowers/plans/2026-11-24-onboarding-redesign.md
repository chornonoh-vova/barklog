# Onboarding Redesign Implementation Plan

> **Record:** implemented on `feat/onboarding-redesign`. After device review the stepped flow with a Back button became a swipeable page `TabView`, a slot meter was added, and the IGDB link moved below the button on every page; the [spec](../specs/2026-11-24-onboarding-redesign-design.md) describes the shipped behaviour.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five-page onboarding carousel with three screens (Welcome with IGDB link, Home Screen widget, Free to use) and no Skip button.

**Architecture:** All work is in `apps/mobile/src/features/onboarding/` plus copy in `packages/i18n`. A pure `steps.ts` holds step order and row content; React Native views (`expo-image`) draw the cover hero and widget mock and are hosted inside the existing SwiftUI `Host` via `RNHostView`, as `Mascot` already is. No API, worker or schema change.

**Tech Stack:** Expo SDK 58, `@expo/ui/swift-ui`, `expo-image`, i18next via `@repo/i18n`, Jest (`jest-expo`) for mobile, Vitest for `packages/i18n`.

**Spec:** `docs/superpowers/specs/2026-11-24-onboarding-redesign-design.md`

## Global Constraints

- Three screens, in order: `welcome`, `widgets`, `free`. No Skip button anywhere. No page dots.
- Screen 1 always shows the IGDB link (`siteUrl()` from `@/lib/igdb/url`, i.e. `https://www.igdb.com`).
- No Premium link, purchase or paywall entry in onboarding.
- Use "Premium", never "Pro". The slot count comes from `FREE_ACTIVE_SLOTS` (`@repo/contracts`), never a literal `10`.
- Every new string exists in all five locales: `de`, `en`, `es`, `ru`, `uk` (`packages/i18n/src/locales/<lang>/app.json`). Plural keys follow each language's plural forms (existing `_one`/`_few`/`_many`/`_other` pattern).
- Cover URLs only via `coverUrl(imageId, "big")` from `@/lib/igdb/image`.
- Gate logic (`onboarding-gate.tsx`, `should-show-onboarding.ts`, `storage.ts`) does not change behaviour.
- Read https://docs.expo.dev/versions/v58.0.0/ for any Expo/`@expo/ui` API before using it (`apps/mobile/AGENTS.md`).
- Branch first: work on `feat/onboarding-redesign`, never `main`.

## Review Focus

1. **Offline or slow first launch:** cover images fail or arrive late; tiles must stay as same-size placeholders and nothing shifts or blocks Continue. (Task 3: placeholder test.)
2. **Smallest iPhone (SE, 375×667) and long German copy:** screen 1's hero must shrink before the feature rows clip or the IGDB link is pushed off-screen. (Task 5: device check in `de`.)
3. **VoiceOver:** covers and mascot are hidden; the IGDB link, Back and Continue are reachable and labelled. (Task 3 and Task 4 tests.)
4. **Back then forward:** going back from screen 3 to 1 and forward again lands on the right screen and completes exactly once. (Task 4 test.)
5. **Reduce Motion:** no fade on cover load. (Task 3 test.)

---

### Task 1: New onboarding copy in all locales

**Files:**

- Modify: `packages/i18n/src/locales/{en,de,es,ru,uk}/app.json` (`onboarding` object)
- Test: `packages/i18n/test/languages-parity.test.ts` (existing, must stay green)

**Interfaces:**

- Produces these keys under `onboarding` (English values are the agreed copy, verbatim):

| Key                         | English                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| `back`                      | Back                                                                            |
| `getStarted`                | Get Started                                                                     |
| `welcomeSubtitle`           | Every game you mean to play, in one place.                                      |
| `trackTitle`                | Track your backlog                                                              |
| `trackDescription`          | Waiting, playing, completed, or abandoned.                                      |
| `exploreRowTitle`           | Explore what's next                                                             |
| `exploreRowDescription`     | Popular, upcoming, and just released.                                           |
| `shareRowTitle`             | Share a clip                                                                    |
| `shareRowDescription`       | Send a YouTube or TikTok, pick the game.                                        |
| `igdbCredit`                | Game data from IGDB.com                                                         |
| `widgetsTitle`              | Your backlog, on your Home Screen                                               |
| `widgetsSubtitle`           | See what you're playing without opening the app.                                |
| `widgetsHint`               | Touch and hold your Home Screen, then tap Edit › Add Widget.                    |
| `freeTitle`                 | Free to use, for real                                                           |
| `freeSubtitle`              | No trial, no locked features.                                                   |
| `freeFeaturesTitle`         | Every feature is free                                                           |
| `freeFeaturesDescription`   | Search, explore, sharing, widgets: all of it.                                   |
| `freeSlotsTitle_one/_other` | {{count, number}} game in progress / {{count, number}} games in progress        |
| `freeSlotsDescription`      | Waiting and playing games use a slot. Completed and abandoned ones never do.    |
| `premiumTitle`              | Premium lifts the cap                                                           |
| `premiumDescription`        | Track as many games as you like, and support the solo developer behind Barklog. |

- Existing `continue` and `welcomeTitle` are kept. Old keys stay until Task 4 removes them.
- `ru` and `uk` need `freeSlotsTitle_one/_few/_many/_other`; `de`/`es` need `_one/_other`. Match whatever forms existing plural keys (e.g. `gamesCount_*`) use per locale.

- [ ] **Step 1:** Add the keys to `en/app.json` with the values above.
- [ ] **Step 2:** Run `pnpm --filter @repo/i18n test`. Expected: FAIL in `languages-parity.test.ts` (other locales missing the keys).
- [ ] **Step 3:** Add translations to `de`, `es`, `ru`, `uk`. Keep "IGDB.com", "YouTube", "TikTok", "Premium" and "Barklog" untranslated; use each locale's existing word for "Premium", "slot" and the four status names if one exists in that file.
- [ ] **Step 4:** Run `pnpm --filter @repo/i18n test && pnpm --filter @repo/i18n check-types`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(i18n): add copy for the three-screen onboarding`.

### Task 2: Step order, row content and cover list

**Files:**

- Create: `apps/mobile/src/features/onboarding/steps.ts`, `apps/mobile/src/features/onboarding/covers.ts`
- Test: `apps/mobile/src/features/onboarding/steps.test.ts`, `apps/mobile/src/features/onboarding/covers.test.ts`

**Interfaces:**

- Produces (`steps.ts`, type-only imports so it stays testable in plain Node like today's `pages.ts`):
  - `type OnboardingStep = "welcome" | "widgets" | "free"`
  - `const ONBOARDING_STEPS: readonly ["welcome", "widgets", "free"]`
  - `function nextStep(step: OnboardingStep): OnboardingStep | undefined` — `undefined` after `free`.
  - `function previousStep(step: OnboardingStep): OnboardingStep | undefined` — `undefined` on `welcome`.
  - `interface FeatureRow { id: string; systemImage: SFSymbol; titleKey: ParseKeys; descriptionKey: ParseKeys }`
  - `const WELCOME_ROWS: readonly FeatureRow[]` — ids `track`, `explore`, `share` in that order, with the Task 1 keys. Symbols: `checklist`, `sparkle.magnifyingglass`, `square.and.arrow.up`.
  - `const FREE_ROWS: readonly FeatureRow[]` — ids `features`, `slots`, `premium`, keys `freeFeatures*`, `freeSlots*` (titleKey `onboarding.freeSlotsTitle`), `premium*`. Symbols: `checkmark.circle`, `square.grid.2x2`, `heart`.
- Produces (`covers.ts`):
  - `interface OnboardingCover { name: string; coverImageId: string }`
  - `const ONBOARDING_COVERS: readonly OnboardingCover[]` — six entries, in this order: Grand Theft Auto VI, Elden Ring, Clair Obscur: Expedition 33, Baldur's Gate 3, God of War (the 2018 game, IGDB slug `god-of-war--1`), Astro Bot.

- [ ] **Step 1: Write failing tests.**
  - `steps.test.ts`: `ONBOARDING_STEPS` equals `["welcome","widgets","free"]`; `nextStep("welcome") === "widgets"`, `nextStep("widgets") === "free"`, `nextStep("free") === undefined`; `previousStep("free") === "widgets"`, `previousStep("welcome") === undefined`; `WELCOME_ROWS.map(r => r.id)` equals `["track","explore","share"]`; every row of both lists resolves to non-empty English copy via `i18n.t` (import `i18n` from `@/lib/i18n/instance`, as `pages.test.ts` does); `track` description names every status in `BACKLOG_STATUSES` (word-boundary regex, as the existing backlog-page test); `share` description contains "YouTube" and "TikTok"; `i18n.t("onboarding.freeSlotsTitle", { count: FREE_ACTIVE_SLOTS })` contains `String(FREE_ACTIVE_SLOTS)`.
  - `covers.test.ts`: six entries; names equal the six names above in order; every `coverImageId` matches `/^[a-z0-9]+$/` and is unique.
- [ ] **Step 2:** Run `pnpm --filter mobile test -- src/features/onboarding/steps src/features/onboarding/covers`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement `steps.ts` per Interfaces.
- [ ] **Step 4:** Look up each game's current cover image id: open `https://www.igdb.com/games/<slug>` (slugs: `grand-theft-auto-vi`, `elden-ring`, `clair-obscur-expedition-33`, `baldurs-gate-3`, `god-of-war--1`, `astro-bot`) and take the id from the cover image URL (`.../t_cover_big/<id>.jpg`), or query the local mirror's `games.cover_image_id` after `pnpm deps:up` and a sync. Confirm each `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/<id>.jpg` returns 200 with `curl -sI`. Write `covers.ts`.
- [ ] **Step 5:** Run the Step 2 command. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(mobile): add onboarding steps, rows and hand-picked covers`.

### Task 3: Cover hero and widget mock views

**Files:**

- Create: `apps/mobile/src/features/onboarding/cover-hero.tsx`, `apps/mobile/src/features/onboarding/widget-mock.tsx`
- Test: `apps/mobile/src/features/onboarding/cover-hero.test.tsx`, `apps/mobile/src/features/onboarding/widget-mock.test.tsx`

**Interfaces:**

- Consumes: `ONBOARDING_COVERS`, `OnboardingCover` (Task 2); `coverUrl` (`@/lib/igdb/image`); `Mascot` (`@/components/mascot`); `useReducedMotion` (`@/ui/use-reduced-motion`); `COVER_ASPECT`, `Type` (`@/ui/theme`); `t("status.playing")`.
- Produces:
  - `function CoverHero({ covers }: { covers: readonly OnboardingCover[] }): JSX.Element` — React Native view: the default mascot on a rounded tile, centred, with up to four covers placed around it at small fixed rotations (roughly −9°, 7°, 6°, −8°, as in the reviewed mockup). Height scales with `useWindowDimensions()` so it shrinks on short screens (builder picks the ratio; must pass the Task 5 SE check).
  - `function WidgetMock({ covers }: { covers: readonly OnboardingCover[] }): JSX.Element` — a small widget (first cover, name, no rating) and a medium widget (four covers with names), each with a "Playing" header (the medium one shows the count `4`). System colours via `PlatformColor` (`secondarySystemBackground`, `label`, `secondaryLabel`), corner radius 20, cover corners 8 / 6.
  - Shared tile behaviour (one internal `CoverTile` in `cover-hero.tsx`, exported for `widget-mock.tsx`): `expo-image` `Image` with `source={{ uri: coverUrl(id, "big") }}`, a `PlatformColor("tertiarySystemFill")` background so the unloaded or failed tile is a placeholder of the same size, `transition={reduceMotion ? 0 : 250}`, `accessible={false}` and `pointerEvents="none"`.
  - Both components set `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"` on their root: decoration only.

- [ ] **Step 1: Write failing tests.**
  - `cover-hero.test.tsx`: renders four cover images whose `source.uri` equal `coverUrl(ONBOARDING_COVERS[i].coverImageId, "big")` for i = 0..3; with `useReducedMotion` mocked to `true`, every cover image has `transition` 0; the root is hidden from accessibility (`screen.queryAllByRole("image")` with default accessibility filtering returns none, or assert the root's `accessibilityElementsHidden` prop).
  - `widget-mock.test.tsx`: shows the names of the first four covers; shows "Playing" twice; does not render a fifth cover name.
  - Placeholder (Review Focus 1): rendering `CoverHero` with a cover whose id is `"missing"` still renders a tile with the same width and height style as the others.
- [ ] **Step 2:** Run `pnpm --filter mobile test -- src/features/onboarding/cover-hero src/features/onboarding/widget-mock`. Expected: FAIL.
- [ ] **Step 3:** Implement `CoverHero`, `CoverTile` and `WidgetMock` per Interfaces.
- [ ] **Step 4:** Run the Step 2 command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(mobile): add onboarding cover hero and widget mock`.

### Task 4: Three-screen onboarding, old pages removed

**Files:**

- Modify: `apps/mobile/src/features/onboarding/onboarding-screen.tsx` (rewrite), `apps/mobile/src/features/onboarding/onboarding-screen.test.tsx` (rewrite), `apps/mobile/src/features/onboarding/onboarding-gate.test.tsx:27-35` (finish via the flow, not Skip)
- Delete: `apps/mobile/src/features/onboarding/pages.ts`, `apps/mobile/src/features/onboarding/pages.test.ts`
- Modify: `packages/i18n/src/locales/{en,de,es,ru,uk}/app.json` (remove `skip`, `start`, `welcomeDescription`, `backlogTitle`, `backlogDescription`, `exploreTitle`, `exploreDescription`, `shareTitle`, `shareDescription`, `igdbTitle`, `igdbDescription` from `onboarding`, after confirming with `grep -rn` that nothing else uses them)
- Modify: `apps/mobile/src/components/illustrations.ts` only if `IllustrationName` values `explore`/`share` become unused everywhere (check `empty-states.ts` first; leave them if used)
- Modify: `docs/superpowers/specs/2026-11-24-onboarding-redesign-design.md` status line and `docs/README.md` row to "implemented, pending device check"

**Interfaces:**

- Consumes: Task 1 keys; `ONBOARDING_STEPS`, `nextStep`, `previousStep`, `WELCOME_ROWS`, `FREE_ROWS` (Task 2); `CoverHero`, `WidgetMock`, `ONBOARDING_COVERS` (Tasks 2–3); `FREE_ACTIVE_SLOTS`; `siteUrl`.
- Produces: `OnboardingScreen({ onComplete }: { onComplete: () => void })` — signature unchanged, so `OnboardingGate` is untouched.

Behaviour: `useState<OnboardingStep>("welcome")`; render only the current step (no `TabView`, no dots, no swipe). A top row holds a Back button (`systemImage` `chevron.left`, accessibility label `t("onboarding.back")`) that is `hidden` on `welcome` but keeps its height, as the current Skip row does. Bottom button: `t("onboarding.continue")` on `welcome`/`widgets`, `t("onboarding.getStarted")` on `free`, styled as today (`GLASS_PROMINENT_STYLE`, `controlSize("large")`). The final press calls `onComplete` once; ignore further presses after it (a `useRef` flag).

- Welcome: `RNHostView matchContents` with `CoverHero`; title `welcomeTitle`; subtitle `welcomeSubtitle`; `WELCOME_ROWS` as leading-aligned rows (brand-tint symbol, bold title, secondary description); footer `Link` to `siteUrl()` with `Label` title `t("onboarding.igdbCredit")`, `systemImage` `arrow.up.right.square`, footnote font, placed just above the button.
- Widgets: title, subtitle, `RNHostView` with `WidgetMock covers={ONBOARDING_COVERS}`, footnote `widgetsHint`.
- Free: `Mascot illustration="backlog"` in `RNHostView`; title, subtitle; `FREE_ROWS`, with `freeSlotsTitle` rendered as `t(key, { count: FREE_ACTIVE_SLOTS })`.

- [ ] **Step 1: Rewrite `onboarding-screen.test.tsx` (failing).**
  - "shows the welcome screen with every feature row": texts "Welcome to Barklog", "Track your backlog", "Explore what's next", "Share a clip" on screen.
  - "links IGDB from the first screen": `getByRole("link")` has `accessibilityHint` `https://www.igdb.com`; text "Game data from IGDB.com" visible.
  - "has no Skip button": `queryByRole("button", { name: "Skip" })` is null on every step.
  - "walks Continue → Continue → Get Started and completes once": after two Continue presses, "Free to use, for real" and `` `${FREE_ACTIVE_SLOTS} games in progress` `` are visible, Continue is gone; pressing "Get Started" twice calls `onComplete` exactly once.
  - "hides Back on the first screen and walks back" (Review Focus 3–4): no Back button on welcome; go to free, press Back twice → "Welcome to Barklog" visible; Continue twice → "Free to use, for real" visible.
  - "shows the widget screen": after one Continue, "Your backlog, on your Home Screen" and the hint text are visible.
  - "never offers Premium": `queryByText(/See Premium/)` null on every step.
- [ ] **Step 2:** Update `onboarding-gate.test.tsx` "lets the app through once onboarding is done": press "Continue", "Continue", then "Get Started" instead of "Skip".
- [ ] **Step 3:** Run `pnpm --filter mobile test -- src/features/onboarding`. Expected: FAIL (old screen).
- [ ] **Step 4:** Rewrite `onboarding-screen.tsx` per Behaviour; delete `pages.ts` and `pages.test.ts`.
- [ ] **Step 5:** Run the Step 3 command. Expected: PASS.
- [ ] **Step 6:** Remove the old keys from all five locales; run `pnpm --filter @repo/i18n test && pnpm --filter mobile test && pnpm --filter mobile lint && pnpm --filter mobile check-types`. Expected: all PASS (type check catches any remaining `ParseKeys` reference to a removed key).
- [ ] **Step 7:** Update spec status and docs index row. Run `npx prettier --check` on changed docs and `git diff --check`.
- [ ] **Step 8:** Commit: `feat(mobile): three-screen onboarding with IGDB on the welcome screen`.

### Task 5: Device check

**Files:** none (fix-ups go in a follow-up commit on the same branch).

- [ ] **Step 1:** Reset the flag: delete the app from the simulator, then follow the local workflow (`pnpm deps:up`, root `pnpm dev`, `pnpm --filter mobile prebuild`, `pnpm --filter mobile ios`). Dev build only, never Expo Go.
- [ ] **Step 2:** On iPhone 17 Pro and iPhone SE (3rd gen) simulators, in light and dark mode, walk all three screens. Expected: screen 1 shows hero, three rows and the IGDB link without scrolling or clipping; covers fade in; Back works; Get Started reaches sign-in.
- [ ] **Step 3:** Switch the simulator language to German and repeat on the SE. Expected: no clipped rows; hero shrinks first.
- [ ] **Step 4:** Turn on Airplane Mode (Network Link Conditioner "100% Loss"), delete and reinstall. Expected: covers show as grey placeholders; flow still completes.
- [ ] **Step 5:** VoiceOver pass on screen 1: focus order is title, subtitle, rows, IGDB link, Continue; no cover or mascot is announced. Turn on Reduce Motion: covers appear without fading.
- [ ] **Step 6:** Tap the IGDB link: it opens igdb.com.
- [ ] **Step 7:** Commit any fixes: `fix(mobile): onboarding layout on small screens` (or as appropriate), and update the spec/docs status to "implemented" once all checks pass.
