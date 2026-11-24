# Landing makeover: discoverability, localization and the cover hero

Status: proposed design, 2026-11-24. Not yet implemented. The current-behavior reference for the site remains [Landing site](2026-09-03-landing-site-design.md); update it when this lands, marking which of its statements this work replaces.

## Intent

Grow Barklog's user base by making barklog.gg easy to find and easy to describe correctly, for two kinds of reader:

- **Search engines** (Google, Bing), ranking the site for searches like "video game backlog tracker", "game backlog app iPhone", and their German, Spanish, Ukrainian and Russian equivalents.
- **AI chatbots and answer engines** (ChatGPT, Claude, Perplexity), which need plain, quotable facts: what Barklog is, what platforms it runs on, what it costs, where its data comes from.

The App Store listing was just reworked for the latest release (`apps/mobile/store.config.json`). The landing gets the same makeover: current copy that agrees with the listing, the new store screenshots, and the onboarding's floating-cover look carried onto the web.

## Timing

The source listing (1.3.3: Profile tab, ratings, new screenshots) is in App Review as of 2026-11-24, staged on `chore/sync-app-store-metadata`. Build from `main` once that branch merges; **deploy the landing only after 1.3.3 is approved and live**, so the site never advertises features the store page does not yet show.

## Goals

1. Copy agrees with the App Store listing in every language the listing ships (en, de, es, uk, ru), so the store, search results and chatbot answers all describe the app the same way.
2. Localized home pages at `/` (English), `/de/`, `/es/`, `/uk/`, `/ru/`, linked by `hreflang`.
3. Machine-readable facts: structured data, a sitemap, `robots.txt` that explicitly welcomes AI crawlers, and an `llms.txt` summary.
4. A new hero modelled on the app's onboarding screen: mascot centred, game covers floating around it.
5. Mobile-first: the hero, headline and App Store badge fit on the first screen of a 375–390 pt iPhone in Safari.
6. Every feature section uses a current App Store screenshot.

## Non-goals

- No upcoming-releases page, per-game pages, or anything else generated from IGDB data. The site stays as simple as possible: one home page per language plus the existing legal/support pages.
- No translated legal pages. Privacy, Terms and Support stay English-only at their current URLs (decided). `https://barklog.gg/privacy`, `/terms` and `/support` are referenced from the App Store metadata and must not move.
- No blog, no search-intent landing pages. Those topics are covered by the FAQ instead.
- No automatic language redirect based on `Accept-Language` or IP. Crawlers must reach every language at a stable URL; people switch with a visible language picker.
- Off-site presence (Reddit, Product Hunt, review sites), which strongly affects what chatbots recommend, is acknowledged but outside this work.

## Anti-goals (would make this a failure even if it works)

- Breaking Apple's App Store badge guidelines, in any language.
- Any third-party request from the site: the privacy policy promises none, and `test/output.test.ts` enforces it. Covers, fonts, badges and images stay self-hosted.
- Weakening the CSP (`unsafe-inline` for scripts or styles).
- Translations living anywhere other than `@repo/i18n` (decided: "ALL translations must be in one place").
- Marketing filler, or claims that disagree with `CONTEXT.md`, the ADRs, or live store configuration. Existing copy tests (`test/home.test.ts`: no filler, no dog feature, real free-tier number) keep applying in every language.
- A hero that pushes the App Store badge below the first screen on a phone.

## Constraints

- Astro 7 static output, Tailwind 4, served by nginx with the CSP in `nginx/snippets/security-headers.conf` (`script-src 'self'; style-src 'self'`, no inline). `build.inlineStylesheets: "never"` stays.
- Apple badge guidelines (<https://developer.apple.com/app-store/marketing/guidelines/>): Apple's artwork only, unmodified, not animated or angled, at least 40 px tall onscreen, clear space of at least one quarter of the badge height on every side, one badge per layout, localized badge for localized pages. The current `AppStoreBadge.astro` already satisfies all of this for English; keep its approach and its CSP fill conversion for every localized SVG.
- Screenshots exist only for `en-US` (`apps/mobile/store/apple/screenshot/en-US/`). Localized pages use the English screenshots; the store does the same today.
- The landing Docker build uses `turbo prune landing`, which follows workspace dependencies, so a dependency on `@repo/i18n` is buildable. `@repo/i18n` must be built before `landing` builds (turbo `dependsOn: ["^build"]` should already cover this; verify).
- Reduced motion: with `prefers-reduced-motion: reduce`, nothing moves. Content is visible without JavaScript.

## Approaches considered

Where the localized copy lives and how pages are produced:

- **A. A `landing` namespace in `@repo/i18n`, Astro i18n routing. (Chosen.)** Copy in `packages/i18n/src/locales/<lng>/landing.json`, beside `app.json`; one page template rendered per language. Keeps every translation in one package, gets the existing language-parity test for free, and shares the `LANGUAGES` list with the app. Cost: landing gains its first workspace dependency.
- **B. Typed dictionaries inside `apps/landing`.** Self-contained, but splits translations across two places and duplicates strings the app already owns (status names and glosses, currently hand-copied from the app). Rejected by the user: all translations in one place.
- **C. One hand-written `.astro` page per language.** Rejected: five copies of the layout drift immediately.

Hero direction (shown as mockups): **A. onboarding scaled up** (chosen) over B. copy-left with covers spilling around the phone, and C. a dimmed field of drifting covers.

## Design

### Pages and routing

| Path                                | Content                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `/`                                 | English home (default locale, no prefix)                                          |
| `/de/`, `/es/`, `/uk/`, `/ru/`      | Localized home, same template                                                     |
| `/privacy/`, `/terms/`, `/support/` | English only, same URLs; new head tags; privacy sharing section corrected (below) |
| `/404`                              | English, unchanged                                                                |

Use Astro's built-in i18n routing (`i18n: { locales: [...], defaultLocale: "en", routing: { prefixDefaultLocale: false } }`) or an equivalent `[lang]` route. The locale list comes from `@repo/i18n`'s `LANGUAGES`, not a second hardcoded list. `<html lang>` is set per page (`uk`, not `ua`).

A small language picker (plain links, native language names: English, Deutsch, Español, Українська, Русский) sits in the footer. Localized pages' links to legal/support pages go to the English routes.

### Copy and `@repo/i18n`

- Add `landing.json` per language under `packages/i18n/src/locales/<lng>/`, exported alongside `app` (e.g. `resources[lng].landing`, typed from English like `AppResources`). Extend `test/languages-parity.test.ts` to cover the new namespace.
- The landing reads the JSON directly at build time; it does not need an i18next instance. A tiny typed `t(lang)` helper in `apps/landing/src` is enough.
- Status names and glosses on the page come from the app's existing keys in `app.json` (the ones `apps/mobile/src/features/backlog/empty-states.ts` uses), not re-typed copies.
- Source of truth for wording: the `en-US` App Store description, subtitle and promo text in `store.config.json`, and their translations in the same file. Landing copy is shorter, page-shaped prose built from those; it is not a paste of the store description.
- Page title per language = that language's store `title` + `–` + store `subtitle`, e.g. `Barklog: Video Game Tracker – Organize Your Backlog`, `Barklog: Spiele-Tracker – Dein Gaming-Backlog`. Every store subtitle contains "backlog", so each title targets both terms without inventing keywords.
- Sharing is described as sharing a **link** ("a clip, review or store page", as the store listing says), never as YouTube/TikTok-only. CONTEXT.md: a Shared link is any HTTPS page address.
- Meta description: one or two plain sentences naming the core facts (backlog tracker, four statuses, share a link, free for ten).

### Page structure (top to bottom, one column on mobile)

1. **Masthead**: app icon + wordmark, unchanged (no App Store link).
2. **Hero**: the chosen composition. Mascot (`apps/mobile/assets/illustrations/barklog-mascot-default.webp`, converted/optimized through `astro:assets`) centred, six covers in a ring around it with the same tilts as `apps/mobile/src/features/onboarding/cover-hero.tsx` `PLACEMENTS`. The covers are the onboarding's six (`ONBOARDING_COVERS` in `covers.ts`: GTA VI, Elden Ring, Clair Obscur, Baldur's Gate III, God of War, Astro Bot), downloaded once at IGDB `t_cover_big` and committed under `apps/landing/src/assets/covers/` (fetch through api.igdb.com; igdb.com blocks automated fetches). Under the ring: `<h1>`, one-sentence subhead, App Store badge, "Free for ten games" line. Centred on every width; desktop is the same composition scaled up. Mockup: `.superpowers/brainstorm/*/content/hero-mobile.html`.
   - Motion: each cover bobs gently (a few px, ~7 s, staggered). CSS animation, disabled under `prefers-reduced-motion`. The badge never moves, and no cover enters its clear-space box.
   - Mobile sizing: on short viewports the ring shrinks before the text does (onboarding's rule). On a 375×667 pt viewport the badge stays above the fold.
   - Covers and mascot are decorative (`alt=""`, hidden from assistive tech).
3. **Share a clip** (first feature: it leads the store listing): `iphone shared.png`.
4. **Four honest statuses**: keeps today's status list; `iphone game details.png` or `iphone home.png`.
5. **Explore / find the next one**: `iphone explore.png`.
6. **Widgets and Profile**: Home Screen widgets and stats/ratings, one section; `iphone widgets.png` (and optionally `iphone profile.png`).
7. **Pricing**: keeps the ten-slot drawing; copy updated to match the store (free for ten Waiting or Playing games, Premium removes the cap and nothing else, 7-day free trial).
8. **FAQ**: 5–7 short questions with plain answers, as visible HTML (`<details>` or headings + paragraphs), e.g.: What is Barklog? Is it free? What does Premium change? Is there an Android version? (state current answer plainly) Where does the game data come from? How does sharing a clip work, and what does it read? Can I delete my account?
9. **IGDB credit** and **footer** (with language picker).

Screenshots are copied from `apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_67/` into `apps/landing/src/assets/screenshots/` (filenames without spaces) and rendered through the existing `Screenshot.astro` frame. The old four screenshots are removed. Alt text describes each screen (existing test).

### App Store badge per language

- Download Apple's official localized "Download on the App Store" badges (black) for de, es, uk, ru from Apple's marketing tools. **The user downloads these**; they are licensed artwork and must come from Apple.
- Store each as `src/assets/app-store-badge-<lng>.svg`, applying the same `style="fill:…"` → `fill="…"` conversion the English file has. `AppStoreBadge.astro` takes `lang` and picks the file; `aria-label` is localized.
- Rendered at 40 px tall with quarter-height clear space, exactly as today. Extend the existing badge test to every locale page.
- Fallback if a localized badge is missing for a language: use the English badge (allowed) rather than block the page.

### Discoverability

**Head tags (every page)**

- `<link rel="canonical">` to itself (already present).
- `hreflang` alternates on the five home pages: one `<link rel="alternate" hreflang="…">` per language plus `hreflang="x-default"` → `/`. Legal pages get no alternates.
- Open Graph + Twitter card: `og:title`, `og:description`, `og:url`, `og:type=website`, `og:locale` (+ `og:locale:alternate`), `og:image` (absolute URL), `twitter:card=summary_large_image`.
- Smart App Banner: `<meta name="apple-itunes-app" content="app-id=6807319879">` (id from `APP_STORE_URL` in `config.ts`).
- Localized `<title>` and meta description on home pages.

**Social preview image**: one 1200×630 PNG, mascot + floating covers on the navy ground, no text (so one image serves every language). Committed under `public/` at a stable path (e.g. `/og.png`), since `og:image` needs a stable absolute URL.

**Structured data (JSON-LD)** on each home page, localized `description` and `inLanguage`:

- `MobileApplication` (or `SoftwareApplication` with `applicationCategory`): name, operatingSystem "iOS, iPadOS", applicationCategory, `offers` (price 0, free tier), `downloadUrl`/`installUrl` = App Store URL, `image`, `author`/`publisher` (Volodymyr Chornonoh), `sameAs` App Store URL.
- `FAQPage` built from the same FAQ strings that render on the page (one source, so markup and visible text cannot disagree).
- `Organization` or `WebSite` minimal (name, url, logo).

Do not include `aggregateRating` unless it is real and kept current.

JSON-LD is a `<script type="application/ld+json">` data block. Browsers do not execute it, so `script-src 'self'` does not block it. But `test/output.test.ts`'s inline-script guard would flag it: narrow the guard to exempt exactly `type="application/ld+json"`, and keep failing on any other inline script.

**`public/robots.txt`**: allow everything; name the AI crawlers explicitly as allowed (`GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-User`, `Claude-SearchBot`, `PerplexityBot`, `Google-Extended`, `Applebot-Extended`); point to the sitemap.

**Sitemap**: `/sitemap.xml` listing every public page with `xhtml:link` hreflang alternates for the home pages. Generate it with a static Astro endpoint (`src/pages/sitemap.xml.ts`) from the same locale list, so no new dependency is needed. `@astrojs/sitemap` is acceptable if the builder prefers it.

**`public/llms.txt`**: plain Markdown summary following the llms.txt convention: one-paragraph description, key facts (iPhone & iPad, four statuses, share a link to a clip, review or store page, widgets, ratings & stats, free for ten unfinished games, Premium removes the cap, 7-day trial, data from IGDB, languages), links to the App Store, privacy, terms and support. English only. Generated at build time from `landing.json` or hand-written; if hand-written, a test checks it names the same free-tier number as the copy.

**Web manifest**: description updated to match the new English subhead.

**nginx**: `robots.txt`, `llms.txt`, `sitemap.xml`, `og.png` are served by the existing `location /` (`try_files`). Check `gzip_types` covers `application/xml` and `text/markdown`/`text/plain` as appropriate. `/de/` etc. resolve via `$uri/index.html`. No CSP change is expected; confirm.

### Privacy policy correction (English, in scope)

`src/pages/privacy.astro` describes sharing as of an older version: "YouTube or TikTok" only, and "only the title and channel name" sent to OpenAI. The API now (`apps/api/src/share/`):

- accepts any HTTPS page (videos, articles, store pages), reading its title, author/site and address via oEmbed or the page's Open Graph tags (`oembed.ts`, `opengraph.ts`, `safe-fetch.ts`);
- sends title, author and site to OpenAI first (`extract.ts` pass 1);
- when that is not enough, sends **the shared URL** to OpenAI with web search enabled (`extract.ts` pass 2, `web_search` tool).

Rewrite the sharing section and the OpenAI line in the processor list to say exactly that, in the page's existing plain voice, keeping the retention/no-training paragraph if still accurate (verify against current OpenAI account settings with the user). Update the policy's "last updated" date. The FAQ answer about sharing and `llms.txt` must agree with the corrected policy. Before writing, re-read the share code for anything else the policy omits (e.g. which page fetch is made from the server, what is logged).

### Testing

Extend the existing Vitest suites over the built output:

- Every locale page: correct `<html lang>`, title and description present, canonical, full hreflang set incl. x-default, OG tags with absolute image URL, Smart App Banner meta, exactly one badge using that locale's Apple artwork, IGDB credit, real free-tier number, no filler words (per-language word lists may be needed, or keep the filler check English-only, builder's call).
- JSON-LD parses, has the expected `@type`s, and its FAQ answers equal the visible FAQ text.
- Only `ld+json` inline scripts are allowed; no third-party requests on any page.
- `robots.txt` references the sitemap; the sitemap lists every page; `llms.txt` exists.
- `@repo/i18n` parity test covers `landing.json`.
- Reduced motion: hero covers have no animation under `prefers-reduced-motion` (existing `motion.test.ts` pattern).

Manual: check the hero on a 375×667 and 390×844 viewport (badge above the fold), Google's Rich Results Test on a deployed preview, and a link-preview check (paste URL into iMessage/Slack).

## Decided by the user

- Purpose: more users; discoverable by search engines and AI chatbots.
- Localized home pages (en, de, es, uk, ru); legal pages English-only.
- All translations in `@repo/i18n`.
- Hero direction A (onboarding scaled up, mascot centred, floating covers).
- Strict adherence to Apple's badge guidelines.
- 1.3.3 is in review; the landing deploys after approval.
- The privacy policy's sharing section is corrected as part of this work; legal URLs stay as the App Store metadata references them.
- Mobile-first layout.
- Section order starting with Share a clip; layout of the mobile mockup approved.
- No upcoming-releases or other generated pages; keep the site simple.

## Calls made by Claude (open to correction)

- English at `/` without prefix; no auto-redirect by language.
- Page titles = store title + subtitle per language.
- `llms.txt` says "share a link (a clip, review or store page)", not YouTube/TikTok.
- Hero covers switch to the onboarding's six; the pricing drawing keeps its existing 17 covers.
- One text-free OG image for all languages.
- FAQ as the place for search-intent topics instead of extra pages.
- Sitemap via a static endpoint rather than a new dependency.
- No iPad screenshot section; "iPhone and iPad" is stated in copy and structured data.
- 404 stays English.

## Left to the builder

- Exact copy per language (drafted from the store translations; reviewed by the user before merge).
- Whether status strings are read from `app.json` directly or re-exported via `landing.json` keys, as long as nothing is duplicated.
- Animation details within the stated limits.
- `MobileApplication` vs `SoftwareApplication` type choice.
