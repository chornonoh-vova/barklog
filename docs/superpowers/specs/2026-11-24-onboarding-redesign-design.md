# Onboarding redesign

Designed on 2026-11-24. Status: **agreed design, implemented on `feat/onboarding-redesign` (pending device check)**.

Replaces the five-page carousel in `apps/mobile/src/features/onboarding/`
with three screens: an Apple-style welcome, a widget showcase, and an honest
explanation of the free tier. Mobile and copy only: no API, worker or schema
change.

References: Apple's own welcome sheets (Fitness), and the Oyelo onboarding
([codewithbeto.dev/resources/oyelo](https://codewithbeto.dev/resources/oyelo),
screens 001 welcome hero, 009 notifications, 010 Pro).

## Intent

Onboarding today is five swipeable pages (welcome, backlog, explore, share,
IGDB) with a Skip button. It is long, and anyone who taps Skip never sees the
IGDB attribution page. Two things users don't discover on their own are the
**Home Screen widget** and **how the free tier works**.

The goal is a shorter, calmer flow that:

- says what Barklog does on one screen, the way Apple's apps do;
- **always shows the IGDB link on the first screen** (hard requirement);
- shows off the widget;
- explains that every feature is free, the free-tier cap applies only to games
  in progress, and Premium removes the cap and supports a solo developer;
- leaves room for release-alert notifications
  ([ADR-0009](../../adr/0009-server-push-release-alerts.md)) without growing
  past three screens.

## Goals, non-goals, anti-goals

**Goals**

- At most three screens, now and after notifications ship.
- IGDB link visible on screen 1 with no way to bypass it.
- Welcome hero shows real IGDB covers of six hand-picked, widely recognised
  games.

**Non-goals**

- Re-showing onboarding to existing users. The gate keeps its current rule:
  signed-in users never see it. A "What's New" sheet for existing users is a
  separate, later piece of work.
- Notification permission. It joins screen 2 when release alerts ship; it is
  not built or stubbed now.
- Any purchase or paywall entry point in onboarding.

**Anti-goals**

- A paywall disguised as onboarding. Screen 3 informs; it never sells.
- A Skip button that hides the IGDB attribution.
- A screen that looks broken offline or on a slow first launch.

## Constraints

- Onboarding runs **before sign-in** (`OnboardingGate`), and every `/api/*`
  route sits behind `requireAuth` in `apps/api/src/app.ts`, so onboarding
  cannot ask the API for anything. Covers load straight from IGDB's public
  image CDN.
- RevenueCat only learns the user after sign-in (`Purchases.logIn` in
  `lib/purchases/provider.tsx`), which is why there is no Premium link.
- Copy lives in `@repo/i18n` and must exist in every locale: `de`, `en`, `es`,
  `ru`, `uk` ([ADR-0011](../../adr/0011-shared-translations-package.md)).
- Glossary terms from `CONTEXT.md`: **Premium** (never "Pro"), **slot**,
  **free-tier cap** (`FREE_ACTIVE_SLOTS = 10`). Only waiting and playing games
  take a slot.
- IGDB covers are 3:4; image URLs come from `coverUrl()` in
  `apps/mobile/src/lib/igdb/image.ts`.

## Approaches

**Screen budget.** Four topics (welcome with IGDB, widgets, future
notifications, Premium) for three screens. Considered: (a) notifications get
their own screen later, taking onboarding to four; (b) Premium drops off
onboarding; (c) widgets and notifications share screen 2, as both keep the
backlog in front of the user outside the app. **Picked (c).**

**Hero imagery.** Considered: (a) bundled covers of real games, dated within a
year and shipped as app assets; (b) abstract status tiles (waiting, playing,
completed, abandoned symbols); (c) mascot poses; (d) real covers loaded
from IGDB's image CDN. **Picked (d).** The covers are shown under the same
IGDB terms as everywhere else in the app, with the attribution link on the
same screen.

**Choosing which covers.** Considered: (a) a small public endpoint returning
recently released games, with an age-rating filter so the first screen stays
suitable for everyone; (b) a hand-picked list in the app. (a) needed a public
route, an ADR exception to "every route requires sign-in", and a worker and
schema change to ingest IGDB age ratings, because the mirror stores neither
age ratings nor trending data. **Picked (b)**: six recognisable games, curated
by the user, with no backend work. The list changes only with an app release,
which is acceptable.

**Skip.** Dropped. Three short screens don't need it, Apple's welcome flows
don't have it, and it was how users missed the IGDB page.

## The design

### Flow

Screen 1 → Continue → Screen 2 → Continue → Screen 3 → Get Started → sign-in
(unchanged). The three screens are pages of a SwiftUI page `TabView`, with
page dots and swiping in both directions; swiping back is the only way back
(no back button, decided after a device review: the tinted back button looked
out of place). No Skip. Each page scrolls on its own, and the IGDB link and
the button sit below the pages, so a tall page (small screen, landscape, large
text) never pushes them away. The button fills the width (capped at 420pt
on iPad) and the IGDB link sits below it, under every page, not only the
first.
Completing screen 3 calls the existing `onComplete` (marks
`barklog.onboarding.seen`). The gate logic and storage flag are unchanged.

### Screen 1: Welcome

- **Hero:** the default mascot centred on a rounded tile, with the hand-picked
  covers (3:4, rounded corners, slight rotations) floating around it, as in
  the Oyelo welcome screen. Four or six covers, whichever fits (see Left to
  the builder).
- **Title:** "Welcome to Barklog". **Subtitle:** "Every game you mean to play,
  in one place."
- **Feature rows** (SF Symbol in brand tint, bold title, secondary
  description), Apple-style and left-aligned:
  - Track your backlog: "Waiting, playing, completed, or abandoned."
  - Explore what's next: "Popular, upcoming, and just released."
  - Share a clip: "Send a YouTube or TikTok, pick the game."
- **Button:** Continue, with the IGDB link below it: "Game data from
  IGDB.com ↗", a link to `siteUrl()`.

### Screen 2: Your backlog, on your Home Screen

- Title "Your backlog, on your Home Screen"; subtitle "See what you're playing
  without opening the app."
- A static mock of the small and medium widgets showing a Playing section,
  with cover and game name like the real widget. It uses the hand-picked
  list, so no separate assets are needed.
- Footnote: "Touch and hold your Home Screen, then tap Edit › Add Widget."
- Button: Continue.
- **Later (not now):** when release alerts ship, a mock release notification
  card and a "Turn on notifications" button join this screen, and the
  headline broadens (e.g. "Stay on top of your backlog").

### Screen 3: Free to use, for real

- Mascot (backlog pose); title "Free to use, for real"; subtitle "No trial,
  no locked features."
- Rows:
  - Every feature is free: "Search, explore, sharing, widgets: all of it."
  - 10 games in progress: "Waiting and playing games use a spot. Completed
    and abandoned ones never do." With a ten-segment slot meter, four filled,
    as decoration. The number comes from `FREE_ACTIVE_SLOTS`, not a literal.
  - Premium lifts the cap: "Track as many games as you like, and support the
    solo developer behind Barklog."
- Button: **Get Started**. No secondary action.

The mockup reviewed in the conversation (dark mode) is the visual reference;
the build follows system colours in both light and dark.

### Hand-picked covers

A fixed list in the onboarding feature, in this order, of
`{ name, coverImageId }`:

1. Grand Theft Auto VI
2. Elden Ring
3. Clair Obscur: Expedition 33
4. Baldur's Gate 3
5. God of War (2018)
6. Astro Bot

The builder looks up each game's current IGDB `coverImageId` (the mirror or
igdb.com) at implementation time. URLs come from `coverUrl(id, "big")`.

- Cover tiles render immediately as neutral placeholders (system fill, same
  shape) and fade in as each image loads. A cover that fails to load (offline
  first launch, changed image id) stays a placeholder; nothing else on the
  screen depends on it. Reduce Motion: no fade or float, just swap.
- No API call, no ADR, no contracts change.

### Copy

All strings are new keys under `onboarding` in `@repo/i18n`, for every locale.
The old page keys (`backlogTitle`, `exploreTitle`, `shareTitle`, `igdbTitle`
and their descriptions) are removed if nothing else uses them. English above
is the agreed wording; other locales are translated by the builder for the
user to review.

## Left to the builder

- How the hero is composed (SwiftUI via `@expo/ui` or a hosted React Native
  view with `expo-image`), as long as it fits on the smallest supported
  iPhone without the feature rows scrolling, shrinking the hero first.
- Whether covers gently float or stay still (static is fine).
- Exact SF Symbols for the feature rows.
- Tests: page/flow logic (`pages.test.ts`, `onboarding-screen.test.tsx`) and
  the cover list (six entries, every id non-empty).
