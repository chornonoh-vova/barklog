# Landing Makeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make barklog.gg discoverable by search engines and AI chatbots: localized home pages (en, de, es, uk, ru), an onboarding-style cover hero, current App Store screenshots, FAQ, structured data, robots/sitemap/llms.txt, and a corrected privacy section on sharing.

**Architecture:** All copy lives in `@repo/i18n` as a separate `landing` export (not in the app's i18next `resources`). The landing renders one `Home.astro` component from two routes: `src/pages/index.astro` (en) and `src/pages/[lang]/index.astro` (the other four, via `getStaticPaths`). Head metadata is computed in `Base.astro` from props; static discoverability files live in `public/` or a static endpoint.

**Tech Stack:** Astro 7 (static), Tailwind 4, Vitest over the built `dist/`, nginx, TypeScript JSON imports in `@repo/i18n`.

**Spec:** `docs/superpowers/specs/2026-11-24-landing-makeover-design.md`

## Global Constraints

- Languages and order come from `LANGUAGES` in `@repo/i18n` (`en, uk, ru, de, es`); never a second hardcoded list. English at `/`, others at `/<lang>/`. No `Accept-Language`/IP redirects.
- Every translation lives in `packages/i18n/src/locales/<lng>/`. No user-facing string is hardcoded in `apps/landing` except on the English-only legal/support/404 pages.
- Privacy, Terms, Support, 404 stay English-only at `/privacy`, `/terms`, `/support` (App Store metadata links them).
- No third-party requests from any page (`test/output.test.ts`). Covers, mascot, badges, OG image are committed files.
- CSP unchanged: no inline `<style>`, no inline executable `<script>`. Only `<script type="application/ld+json">` is allowed inline.
- App Store badge: Apple's artwork only, unmodified, never animated, rendered 40 px tall with quarter-height (10 px) clear space, exactly one per page, localized artwork per language when supplied (English fallback).
- `prefers-reduced-motion: reduce` → nothing moves. Content visible without JavaScript.
- Mobile-first: on a 375×667 viewport the hero headline and App Store badge are fully visible without scrolling.
- Sharing is described as sharing a **link** (a clip, review or store page), never as YouTube/TikTok-only.
- Page `<title>` per language = store `title` + `–` + store `subtitle` from `apps/mobile/store.config.json`.
- Existing copy rules hold in every language: no marketing filler (`BANNED` list in `test/home.test.ts`), no claim of a dog feature, free tier stated as ten.
- Deploy only after App Store version 1.3.3 is approved (not a code task; noted in the PR).

## Review Focus

1. **Short phones (375×667, Safari chrome visible):** hero ring must shrink before text; badge stays above the fold. Pinned by the viewport check in Task 3.
2. **A locale missing its Apple badge file:** page must still build with the English badge, not fail or render nothing. Pinned by Task 5's fallback test.
3. **Long translated strings (German, Russian)** in the hero `<h1>` and FAQ: must wrap, never overflow horizontally at 375 px. Pinned by the no-horizontal-scroll check in Task 3, run for `/de/` and `/ru/`.
4. **FAQ text vs JSON-LD drift:** structured data answers must equal what's visible. Pinned by Task 6's equality test.
5. **Legal pages reached from a localized page:** links must go to the English routes and resolve (no `/de/privacy` 404). Pinned by Task 2's link test.

---

### Task 1: `landing` copy namespace in `@repo/i18n`

**Files:**

- Create: `packages/i18n/src/locales/{en,de,es,uk,ru}/landing.json`
- Create: `packages/i18n/src/landing.ts`
- Modify: `packages/i18n/src/index.ts` (export)
- Modify: `packages/i18n/test/copy.test.ts` (cover `landing`)

**Interfaces:**

- Produces: `export type LandingCopy = typeof enLanding;` and `export const landing: Record<Language, LandingCopy>;` from `@repo/i18n`. Not added to `resources` (the app's i18next must not load web copy).
- Key tree (every language identical; strings only, nested objects, no arrays):
  - `meta.title`, `meta.description`
  - `hero.title`, `hero.subtitle`, `hero.free`
  - `badge.label` (aria-label, e.g. "Download Barklog on the App Store")
  - `share.{eyebrow,title,body,alt}`, `statuses.{eyebrow,title,body,alt}`, `explore.{eyebrow,title,body,alt}`, `widgets.{eyebrow,title,body,alt}`
  - `pricing.{eyebrow,title,body,cap,free,premium}`
  - `faq.title`, `faq.items.{whatIs,free,premium,android,data,sharing,deleteAccount}.{q,a}`
  - `credit.before`, `credit.link`, `credit.after` (IGDB sentence split around the link)
  - `footer.madeBy`, `footer.language`, `footer.legalNote` (e.g. "Legal pages are in English.")
- Status names and glosses are **not** in `landing.json`; Task 4 reads `resources[lng].app.status.*` and `resources[lng].app.backlog.emptyFilter.*.description`.

- [ ] **Step 1: Write the failing test.** In `copy.test.ts`, add `describe.each(LANGUAGES)("%s landing copy", …)` reusing `leaves()` and `tokens()`: `expect([...copy(lng).keys()].sort()).toEqual([...english.keys()].sort())`, every leaf non-empty, and tokens match English per key. Add: `expect(landing.en.meta.title).toBe("Barklog: Video Game Tracker – Organize Your Backlog")` and `expect(landing.de.meta.title).toBe("Barklog: Spiele-Tracker – Dein Gaming-Backlog")`.
- [ ] **Step 2: Run** `pnpm --filter @repo/i18n test` → FAIL (`landing` not exported).
- [ ] **Step 3: Write English `landing.json`** from the en-US store description/promo in `apps/mobile/store.config.json` (page-shaped, shorter; keep the current site's plain voice and "Abandoned is a real answer"). FAQ answers state facts plainly: iPhone and iPad; free for ten Waiting or Playing games; Premium removes the cap and nothing else, monthly or yearly, 7-day free trial; no Android version; data from IGDB; sharing reads the page's title, author and site, and if needed looks the link up on the web (must agree with Task 8's privacy text); delete account from Profile → Delete Account.
- [ ] **Step 4: Write de/es/uk/ru** from the matching store translations; `meta.title` = store title + " – " + store subtitle for that language.
- [ ] **Step 5: Implement `landing.ts`** importing the five JSON files `with { type: "json" }`, keyed by `Language`; export from `index.ts`.
- [ ] **Step 6: Run** `pnpm --filter @repo/i18n test && pnpm --filter @repo/i18n check-types && pnpm --filter @repo/i18n build` → PASS; `ls packages/i18n/dist/locales/de/landing.json` exists.
- [ ] **Step 7: Commit** `feat(i18n): add landing page copy in all app languages`.

### Task 2: Locale routing, head alternates and language picker

**Files:**

- Modify: `apps/landing/package.json` (add `"@repo/i18n": "workspace:*"`)
- Create: `apps/landing/src/i18n.ts`
- Create: `apps/landing/src/components/Home.astro` (moves body of `pages/index.astro`)
- Modify: `apps/landing/src/pages/index.astro` → `<Home lang="en" />`
- Create: `apps/landing/src/pages/[lang]/index.astro`
- Modify: `apps/landing/src/layouts/Base.astro`, `apps/landing/src/components/Footer.astro`
- Create: `apps/landing/test/locales.test.ts`

**Interfaces:**

- Consumes: `landing`, `LANGUAGES`, `Language` from `@repo/i18n`.
- Produces in `src/i18n.ts`:
  - `export const LOCALES: readonly Language[]` (= `LANGUAGES`)
  - `export function homePath(lang: Language): string` → `"/"` for en, `"/de/"` etc.
  - `export function copy(lang: Language): LandingCopy`
  - `export const NATIVE_NAMES: Record<Language, string>` = `{ en: "English", de: "Deutsch", es: "Español", uk: "Українська", ru: "Русский" }`
  - `export const OG_LOCALE: Record<Language, string>` = `{ en: "en_US", de: "de_DE", es: "es_ES", uk: "uk_UA", ru: "ru_RU" }`
- `Base.astro` new props: `lang?: Language` (default `"en"`), `alternates?: boolean` (default false; true only on home pages). Renders `<html lang={lang}>` and, when `alternates`, one `<link rel="alternate" hreflang={l} href={absolute homePath(l)}>` per locale plus `hreflang="x-default"` → `https://barklog.gg/`.
- `Footer.astro` new prop `lang`; renders language links (`NATIVE_NAMES`, `hreflang`, `lang` attrs, `aria-current="page"` on current) and legal links always to `/support`, `/terms`, `/privacy`.

- [ ] **Step 1: Write failing tests** in `locales.test.ts`, for each `lng` of `LANGUAGES` reading `dist/index.html` or `dist/<lng>/index.html`: `<html lang="${lng}">`; `<title>` equals `landing[lng].meta.title`; canonical is `https://barklog.gg${homePath(lng)}`; exactly 6 `hreflang` alternates incl. `x-default`; footer contains a link to every other locale's `homePath`; every `href` starting with `/` that isn't `/_astro/` resolves to a file in `dist` (`x/` → `x/index.html`, `x` → `x/index.html` or `x.html`). Also: `dist/privacy/index.html` has no `hreflang`.
- [ ] **Step 2: Run** `pnpm --filter landing test -- locales` → FAIL.
- [ ] **Step 3: Implement** `i18n.ts`, `Home.astro` (props `{ lang: Language }`, passes `lang`, `title`, `description`, `alternates` to `Base`), `[lang]/index.astro` with `getStaticPaths()` returning `LOCALES.filter(l => l !== "en")`, Base/Footer props. Keep existing sections rendering English for now except title/description.
- [ ] **Step 4: Run** `pnpm --filter landing test` → all PASS (existing home tests still read `dist/index.html`).
- [ ] **Step 5: Verify Docker build path:** `pnpm exec turbo run build --filter=landing` builds `@repo/i18n` first (look for `@repo/i18n:build` in output).
- [ ] **Step 6: Commit** `feat(landing): serve a home page per app language`.

### Task 3: Cover hero

**Files:**

- Create: `apps/landing/src/assets/mascot.webp` (copy of `apps/mobile/assets/illustrations/barklog-mascot-default.webp`)
- Create: `apps/landing/src/assets/hero-covers/{grand-theft-auto-vi,elden-ring,clair-obscur-expedition-33,baldurs-gate-iii,god-of-war,astro-bot}.jpg`
- Modify: `apps/landing/src/components/Hero.astro`, `apps/landing/src/styles/global.css`
- Test: `apps/landing/test/hero.test.ts`

**Interfaces:**

- `Hero.astro` props: `{ lang: Language }`; uses `copy(lang).hero.*`; renders `<AppStoreBadge lang={lang} />` (Task 5 adds the prop; until then pass nothing).
- Cover ids from `apps/mobile/src/features/onboarding/covers.ts` (`cocv1v, co4jni, co9gam, co670h, cobkt6, coba3k`), downloaded once from `https://images.igdb.com/igdb/image/upload/t_cover_big/<id>.jpg` with curl and committed. Placements copy `PLACEMENTS` from `cover-hero.tsx` (x, y fractions and rotations).

- [ ] **Step 1: Write failing tests** in `hero.test.ts` against `dist/index.html`: the hero `<section>` contains the `<h1>` and the badge; every `<img>` inside the cover ring has `alt=""` and the ring has `aria-hidden="true"`; the badge element is **not** inside the ring element; built CSS contains a rule disabling the cover animation inside `@media (prefers-reduced-motion: reduce)` (assert on the class name used, e.g. `.hero-cover`, appearing with `animation: none` in that media block); the old hero screenshot alt text is gone.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Ring is a relatively positioned box, `aspect-ratio` driven, width `min(100%, 22rem)` on phones growing to ~34rem on `lg`; height capped by `max-height: 34svh` on phones so short screens shrink the ring, not the text. Mascot via `astro:assets` `<Image>` (eager, decorative). Covers via `<Image>` widths `[120, 240]`. Bob animation: `translate` 0 → -8px, 7s ease-in-out infinite, staggered `animation-delay`, only inside `@media (prefers-reduced-motion: no-preference)`. Everything centred; `<h1>` `text-balance`, `clamp()` size starting ≤ 2.25rem at 375 px.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Viewport check** (playwright-cli, `pnpm --filter landing preview`): at 375×667 on `/`, `/de/`, `/ru/`: badge's bounding box bottom ≤ 667 − 10 and `document.documentElement.scrollWidth === 375`. At 390×844 and 1440×900 screenshot for the PR. Fix and repeat until true.
- [ ] **Step 6: Commit** `feat(landing): onboarding-style cover hero`.

### Task 4: Feature sections, pricing and FAQ from copy

**Files:**

- Create: `apps/landing/src/assets/screenshots/{shared,game-details,explore,widgets,profile}.png` (from `apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_67/`)
- Delete: `apps/landing/src/assets/screenshots/{backlog,game,share,explore}.png` (old)
- Modify: `apps/landing/src/components/Home.astro`, `Pricing.astro`
- Create: `apps/landing/src/components/Faq.astro`
- Modify: `apps/landing/test/home.test.ts`

**Interfaces:**

- `Faq.astro` props `{ lang: Language }`; renders `copy(lang).faq.items` in key order as `<details><summary>{q}</summary><p>{a}</p></details>` (visible, works without JS).
- `export function faqEntries(lang: Language): { q: string; a: string }[]` in `src/i18n.ts` (Task 6 reuses it for JSON-LD).
- Section order: Share (`shared.png`), Statuses (`game-details.png`, status rows from `resources[lng].app.status.*` + `backlog.emptyFilter.*.description`), Explore (`explore.png`), Widgets & Profile (`widgets.png`), Pricing, FAQ, IGDB credit.

- [ ] **Step 1: Update/extend tests** in `home.test.ts` to loop over every locale page: `BANNED` absent; no `/dog/i`-feature claim (keep existing test's logic); free tier "10"/"ten"/localized numeral present (assert `copy(lng).pricing.body` text appears); 4 screenshot `<img>` with non-empty alt equal to `copy(lng).<section>.alt`; FAQ has 7 `<details>`; status names equal `resources[lng].app.status.*`. Existing English-only assertions keep working.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** sections from copy; Pricing takes `lang`; Feature stacks single-column below `lg` with screenshot after text.
- [ ] **Step 4: Run** `pnpm --filter landing test && pnpm --filter landing check-types && pnpm --filter landing lint` → PASS.
- [ ] **Step 5: Commit** `feat(landing): localized sections, new screenshots and FAQ`.

### Task 5: Localized App Store badges

**Blocked on the user supplying** Apple's official black "Download on the App Store" SVGs for de, es, uk, ru. Ask before starting; if any are missing, implement with English fallback and list the missing ones in the PR.

**Files:**

- Create: `apps/landing/src/assets/app-store-badge-{de,es,uk,ru}.svg`
- Modify: `apps/landing/src/components/AppStoreBadge.astro`
- Modify: `apps/landing/test/home.test.ts` (badge test per locale), `test/output.test.ts` (fill check covers all badge files)

**Interfaces:**

- `AppStoreBadge.astro` props `{ lang?: Language }` (default `"en"`); picks `app-store-badge-<lang>.svg` via `import.meta.glob(..., { eager: true })`, falls back to `app-store-badge.svg`; `aria-label={copy(lang).badge.label}`. Same wrapper (`p-2.5`), native 40 px height.

- [ ] **Step 1: Write failing tests:** per locale page exactly one `Download_on_the_App_Store_Badge` match; for locales with a file, the badge `<svg>` `<title>` equals that file's `<title>`; no `style="` attribute in any `src/assets/app-store-badge*.svg`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Convert** each supplied SVG's `style="fill: …"` to `fill="…"` (same as the existing file's comment describes), commit files.
- [ ] **Step 4: Implement** prop and fallback.
- [ ] **Step 5: Run** tests → PASS.
- [ ] **Step 6: Commit** `feat(landing): Apple's localized App Store badges`.

### Task 6: Social cards, Smart App Banner and structured data

**Files:**

- Create: `apps/landing/public/og.png` (1200×630, mascot + floating covers on `#0b1a3c`, no text)
- Create: `apps/landing/src/structured-data.ts`
- Modify: `apps/landing/src/layouts/Base.astro`, `apps/landing/src/config.ts`, `apps/landing/public/site.webmanifest`
- Modify: `apps/landing/test/output.test.ts`
- Create: `apps/landing/test/seo.test.ts`

**Interfaces:**

- `config.ts`: `export const APP_STORE_ID = "6807319879";` and derive `APP_STORE_URL` from it.
- `structured-data.ts`: `export function homeJsonLd(lang: Language): object[]` returning `[MobileApplication, FAQPage, WebSite]`. `MobileApplication`: `name: "Barklog"`, `operatingSystem: "iOS, iPadOS"`, `applicationCategory: "LifestyleApplication"` (or `GameApplication`, builder's call), `description: copy(lang).meta.description`, `inLanguage: lang`, `offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }`, `installUrl`/`sameAs: APP_STORE_URL`, `image: "https://barklog.gg/og.png"`, `author: { "@type": "Person", name: "Volodymyr Chornonoh" }`. `FAQPage.mainEntity` built from `faqEntries(lang)`. No `aggregateRating`.
- `Base.astro` new prop `jsonLd?: object[]`, rendered as `<script type="application/ld+json" set:html={JSON.stringify(item)} />` per item. Every page gets: `og:title`, `og:description`, `og:url` (= canonical), `og:type=website`, `og:image=https://barklog.gg/og.png`, `og:image:width/height`, `og:locale` (`OG_LOCALE[lang]`) + `og:locale:alternate` on home pages, `twitter:card=summary_large_image`, `<meta name="apple-itunes-app" content="app-id=6807319879">`.

- [ ] **Step 1: Write failing tests** in `seo.test.ts` per locale: every listed meta present with expected values; `og:image` file exists in `dist`; each `ld+json` block `JSON.parse`s; `@type`s are exactly `MobileApplication`, `FAQPage`, `WebSite`; FAQ `mainEntity[i].name`/`acceptedAnswer.text` equal the visible `<summary>`/`<p>` texts in order. In `output.test.ts`, narrow `INLINE_SCRIPT` to skip `type="application/ld+json"` and add a test that an inline non-ld+json script still fails the regex (use a fixture string).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Make `og.png`** with a one-off script (sharp is available through Astro) or a Playwright screenshot of a scratch HTML page; the script stays in the scratchpad, only the PNG is committed.
- [ ] **Step 4: Implement** `structured-data.ts`, Base props, config, manifest description = `landing.en.hero.subtitle`.
- [ ] **Step 5: Run** all landing tests → PASS.
- [ ] **Step 6: Commit** `feat(landing): social cards, Smart App Banner and structured data`.

### Task 7: robots.txt, sitemap and llms.txt

**Files:**

- Create: `apps/landing/public/robots.txt`
- Create: `apps/landing/src/pages/sitemap.xml.ts`
- Create: `apps/landing/src/pages/llms.txt.ts`
- Modify: `apps/landing/nginx/default.conf` (`gzip_types` += `text/xml application/xml`)
- Modify: `apps/landing/test/nginx.test.ts` if it pins `gzip_types`
- Create: `apps/landing/test/crawlers.test.ts`

**Interfaces:**

- `robots.txt`: `User-agent: *` / `Allow: /`, then explicit `User-agent:` + `Allow: /` blocks for `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-User`, `Claude-SearchBot`, `PerplexityBot`, `Google-Extended`, `Applebot-Extended`; `Sitemap: https://barklog.gg/sitemap.xml`.
- `sitemap.xml.ts`: `export const GET: APIRoute` returning XML (`Content-Type: application/xml`) with `<url>` for every `homePath(lang)` (each with `xhtml:link` alternates incl. `x-default`) plus `/support/`, `/terms/`, `/privacy/`. Absolute `https://barklog.gg` URLs, trailing slashes matching canonicals.
- `llms.txt.ts`: `GET` returning `text/plain` Markdown built from `landing.en` + `faqEntries("en")`: `# Barklog`, `> ` one-line summary (`meta.description`), a "Key facts" list, the FAQ as `## Q` / answer, then links (App Store, privacy, terms, support, each language home).

- [ ] **Step 1: Write failing tests:** `dist/robots.txt` names each crawler above and the sitemap URL; `dist/sitemap.xml` contains every home URL, the three legal URLs, and 6 `hreflang` alternates per home `<url>`; every sitemap `<loc>` maps to a file in `dist`; `dist/llms.txt` starts with `# Barklog`, contains `APP_STORE_URL`, the free-tier sentence from `landing.en.pricing.body`, and no "YouTube or TikTok".
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** files and nginx change.
- [ ] **Step 4: Run** all landing tests → PASS.
- [ ] **Step 5: Commit** `feat(landing): robots.txt, sitemap and llms.txt for crawlers`.

### Task 8: Correct the privacy policy on sharing

**Files:**

- Modify: `apps/landing/src/pages/privacy.astro`
- Modify: `apps/landing/test/legal.test.ts`

- [ ] **Step 1: Re-read** `apps/api/src/share/{identify,extract,oembed,opengraph,safe-fetch,provider}.ts` and list exactly: which requests the server makes for a shared link (oEmbed vs fetching the page itself), what goes to OpenAI in pass 1 (title, author, site) and pass 2 (the URL, web search), what is logged. Ask the user to confirm OpenAI retention (30 days) and training opt-out are still true.
- [ ] **Step 2: Write failing test** in `legal.test.ts`: privacy page does not contain "YouTube or TikTok" as the only accepted source and does contain words for web search and for sending the link (e.g. `/search the web/i`, `/link/i` in the OpenAI section); `updated` date is not "17 November 2026".
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Rewrite** the sharing section and the OpenAI processor line in the page's existing first-person plain voice to match Step 1; set `updated` to the commit date. Check Task 1's `faq.items.sharing.a` (all languages) agrees; fix copy if not.
- [ ] **Step 5: Run** landing + i18n tests → PASS.
- [ ] **Step 6: Commit** `fix(landing): describe what sharing actually sends in the privacy policy`.

### Task 9: Documentation and final verification

**Files:**

- Modify: `docs/superpowers/specs/2026-09-03-landing-site-design.md` (current-behavior reference: locales, `@repo/i18n` dependency, discoverability files, privacy change; mark replaced statements)
- Modify: `docs/superpowers/specs/2026-11-24-landing-makeover-design.md` (status → implemented)
- Modify: `AGENTS.md` repo map: `packages/i18n` "shared by the app, backend and landing"
- Modify: this plan (mark historical per `docs/README.md` convention)

- [ ] **Step 1: Update docs** as listed; `git diff --check`; `pnpm exec prettier --check` on changed docs.
- [ ] **Step 2: Full verification:** `pnpm exec turbo run test lint check-types --filter=landing --filter=@repo/i18n --filter=mobile` (mobile because `@repo/i18n` changed) → all PASS.
- [ ] **Step 3: Docker build:** `docker build -f apps/landing/Dockerfile -t barklog-landing .` succeeds; `docker run -p 8080:8080` and `curl -sI localhost:8080/de/` → 200 with CSP header; `curl -s localhost:8080/sitemap.xml | head`.
- [ ] **Step 4: Commit** `docs(landing): record the makeover in the landing reference`.
- [ ] **Step 5: Submit the stack:** `gh stack submit --auto` (PR on top of #120), then edit the PR body: summary, screenshots from Task 3 Step 5, missing badges if any, and "Deploy after 1.3.3 is approved."
