# Landing Site (`apps/landing`) — Design

**Date:** 2026-09-03
**Status:** Approved for planning

## 1. Purpose

`barklog.gg` resolves to nothing. The App Store listing needs a marketing
page, and an app with an auto-renewing subscription needs published Terms and
a Privacy policy at stable URLs — the paywall links to both.

This design adds `apps/landing`: an Astro static site built into an nginx
image, published from CI like the existing three, and added to `compose.yaml`
so Dokploy can attach the domain.

### Goals

- Three routes at launch: `/`, `/terms`, `/privacy`.
- `/` sells the app to someone who has not heard of it, and links to the App
  Store.
- `/terms` and `/privacy` are accurate about what Barklog actually does,
  plainly worded, minimally styled.
- The site makes no third-party requests of any kind, so the Privacy policy's
  claim to that effect is literally true.
- Strict security headers.

### Non-goals

- **No analytics.** Nginx access logs only.
- **No email capture.** No forms, no server, nothing to store.
- **No blog, changelog, or FAQ.** Three routes.
- **No `/problems/*` pages.** See section 12.
- **No i18n.** English only.

## 2. Decisions

| Question              | Decision                                                        |
| --------------------- | --------------------------------------------------------------- |
| Framework             | Astro 7.2.10, `output: 'static'`, no UI framework                |
| Styling               | Tailwind CSS 4.3.3 via `@tailwindcss/vite`                       |
| Design tokens         | A `@theme` block in `src/styles/global.css` — no config file      |
| Animation             | `motion` (Motion One vanilla build), scroll-triggered            |
| Runtime image         | `nginxinc/nginx-unprivileged:alpine`, port 8080                  |
| Dockerfile location   | `apps/landing/Dockerfile`, repository root as build context      |
| Fonts                 | Self-hosted woff2, Latin subset                                  |
| App Store URL         | One constant in `src/config.ts`, marked TODO until assigned      |

Three decisions deserve their reasoning recorded.

**`@tailwindcss/vite`, not `@astrojs/tailwind`.** The integration package peers
on `astro ^3 || ^4 || ^5` and `tailwindcss ^3.0.24`. It cannot be used here.
Tailwind 4 is a Vite plugin, configured in CSS through `@theme` rather than a
`tailwind.config.js`, which is why the design tokens live in `global.css`.

**A separate `Dockerfile`, not a fourth target in the root one.** That file's
framing is three Node runtime images from one shared build, and it says so in
its header. The landing chain shares only the `base` stage: it needs its own
`turbo prune`, its own install, its own build, and an nginx runtime rather
than a Node one. Folding it in would add four stages that share nothing with
the other three. Layer caching works across files, so the split costs
nothing.

**`nginx-unprivileged`, not `nginx`.** The stock image runs its master process
as root. The three existing images all run as `node`. Port 8080 rather than 80
follows from dropping the privilege.

## 3. The Astro app

```
apps/landing/
  astro.config.mjs
  package.json            name: "landing"
  tsconfig.json           extends @repo/typescript-config
  eslint.config.js
  Dockerfile
  nginx/
    default.conf
    snippets/security-headers.conf
  src/
    config.ts             APP_STORE_URL, CONTACT_EMAIL
    styles/global.css     @import "tailwindcss" + @theme tokens
    layouts/
      Base.astro          <head>, fonts, global.css
      Legal.astro         narrow measure, no motion, no JS
    components/           Hero, Feature, Pricing, Footer, Reveal
    pages/
      index.astro
      terms.astro
      privacy.astro
      404.astro
    assets/
      screenshots/        backlog.png game.png explore.png share.png
      fonts/
```

`package.json` is named `landing` so `turbo prune landing --docker` resolves
it. Scripts: `dev`, `build`, `check-types` (`astro check`), `lint` (`eslint .
--max-warnings 0`), matching the other workspaces. `astro check` needs
`@astrojs/check` as a dev dependency; it peers on `typescript ^5 || ^6`, which
the workspace's `~6.0.3` satisfies.

### 3.1 Constraints the configuration must respect

- **`build.inlineStylesheets: 'never'`.** Astro's default is `'auto'`, which
  inlines stylesheets under ~4KB into a `<style>` tag. That single convenience
  would force `style-src 'unsafe-inline'` and gut the Content-Security-Policy
  in section 7. This setting is load-bearing, not cosmetic.
- **No `is:inline` scripts, no view transitions, no prefetch.** All three emit
  inline script, with the same consequence for `script-src`. The animation
  layer is an ordinary bundled module.
- **`@tailwindcss/oxide` and `sharp` need `allowBuilds` entries** in
  `pnpm-workspace.yaml`. Both have native postinstall steps, and that file's
  existing comment records the consequence of leaving one undecided: a fresh
  `pnpm install --frozen-lockfile` exits 1, which fails CI.
- **`sharp` must work on `node:24-alpine`.** `astro:assets` requires it. It
  ships musl prebuilds, but this is verified in the first container build
  rather than in CI; the fallback is a Debian-slim build stage.

## 4. Design

Dark-first on the splash navy `#0B1A3C`, with `#208AEF` as the accent, so the
site and the app's first frame agree. Both are declared in `@theme` alongside
the type scale and the font families, making `global.css` the single source of
design truth rather than scattering arbitrary values through markup.

Typography is a self-hosted display face plus a text face, Latin-subset woff2,
preloaded. Not a system stack — but not Google Fonts either, which is what
keeps section 7's `font-src 'self'` and the Privacy policy's no-third-party
claim both true.

The `frontend-design` skill guides the visual direction at implementation.

### 4.1 Motion

`motion`, the vanilla build, driving scroll-triggered reveals through
`IntersectionObserver`. The rules, per the `emil-design-eng` skill:

- Transform and opacity only. Nothing that triggers layout.
- 150–250ms, spring-like easing.
- Reveals fire once and unobserve. No re-animation on scroll-up.
- Everything collapses to a no-op under `prefers-reduced-motion: reduce`,
  including the initial hidden state — content must never be stuck invisible
  because motion was disabled.

The legal pages load no JavaScript at all.

## 5. The root page

Hero → backlog → explore → share a video → free vs. Premium → IGDB credit →
footer. About a six-screen scroll.

### 5.1 Screenshots

Four slots, at `src/assets/screenshots/{backlog,game,explore,share}.png`,
rendered through `astro:assets` for avif/webp and responsive `srcset` at build
time. Placeholder PNGs at 1290×2796 are committed so the build is green, and
they read visibly as placeholders so an unswapped one cannot ship unnoticed.

### 5.2 Copy

The voice is the app's own. `apps/mobile/src/features/backlog/empty-states.ts`
is the reference: "Games you gave up on. No judgement." Second person, present
tense, concrete scenarios rather than abstract benefits, fragments allowed for
emphasis, limits admitted rather than hidden.

Banned outright: *seamlessly*, *effortlessly*, *powerful yet simple*,
*revolutionize*, *elevate*, *unlock*, *supercharge*, *game-changer*, and
exclamation marks. The `humanizer` skill is run over the finished copy as a
check, not as a substitute for writing it well.

**There is no dog companion.** The repository README describes Barklog as
having "a cute dog companion keeping score". No such feature exists in the
code — no streaks, no scoring, no pet mechanic. The dog is the app mark. Copy
must not imply otherwise.

The Premium section states the real numbers: ten active slots on the free
tier, where active means waiting or playing, and finishing or abandoning a
game returns its slot. That last clause is the honest part, and it comes
straight from `slotDelta` in `packages/contracts/src/subscription.ts`.

## 6. Legal pages

One `Legal.astro` layout: system font stack, roughly a 68-character measure,
no motion, no JavaScript, a link back to `/`. Minimal by intent.

### 6.1 Terms

Operated by Volodymyr Chornonoh, an individual developer in Ukraine, governed
by Ukrainian law, reachable at `chernonog.vova@gmail.com`.

Covers: the licence to use the app; acceptable use; the subscription being an
Apple transaction, with billing, cancellation and refunds handled by Apple and
not by Barklog; **that deleting a Barklog account does not cancel an active
App Store subscription**; IGDB as the source of all game data; a minimum age
of 13; no warranty; and termination.

### 6.2 Privacy

Written from what the code does, not from a template.

**Collected:** the Clerk `sub` (which is `users.id`), whatever Clerk holds to
authenticate the user, backlog entries with their statuses and ratings, and
subscription state received from RevenueCat.

**Processors:** Clerk, RevenueCat, Apple, Anthropic, PlanetScale,
IGDB/Twitch, and the VPS host.

Two claims are worth stating precisely because they are stronger than what
most apps can say, and both are verifiable in this repository:

- **The website sets no cookies and makes no third-party requests.** No
  analytics, no fonts from a CDN, no embeds. Section 7's CSP enforces it.
- **Share-a-video sends only the video's title and channel name to
  Anthropic.** Not the video, not the user's identity. The request is built in
  `apps/api/src/share/extract.ts`; the metadata comes from oEmbed.

**Deletion** is described as the in-app Clerk flow, which the account-deletion
design delivers first. It repeats that App Store subscriptions must be
cancelled separately through Apple.

Also covered: retention, children, changes to the policy, and contact.

## 7. Security headers

Served by nginx, starting from `default-src 'none'` and allowing only what is
genuinely used:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none';
form-action 'none'; frame-ancestors 'none'; object-src 'none';
upgrade-insecure-requests
```

No `'unsafe-inline'` anywhere. This is only reachable because of the build
constraints in section 3.1; if either is relaxed, the policy has to be
weakened, and that trade should be made deliberately rather than discovered.

Alongside it: `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, a
`Permissions-Policy` denying camera, microphone, geolocation, payment, USB and
the rest, `Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Resource-Policy: same-origin`, and `server_tokens off`.

`Strict-Transport-Security: max-age=31536000; includeSubDomains`, **without
`preload`**. Preload submission is effectively irreversible, and
`includeSubDomains` from the apex already covers `api.barklog.gg`. Noted for
the reader: the API sets `preload` on its own responses
(`apps/api/src/app.ts`), so the two differ deliberately — a subdomain's
`preload` does not enrol the apex, and enrolling the apex is the decision
being deferred.

### 7.1 The `add_header` inheritance trap

nginx's `add_header` does **not** inherit into a `location` block that
declares any `add_header` of its own. The `_astro/*` block needs its own
`Cache-Control: immutable`, which would silently drop every security header
above for exactly the assets that carry the JavaScript.

The headers therefore live in `nginx/snippets/security-headers.conf`, and
every `location` block `include`s it explicitly. This is one of the few places
in this design where a code comment is warranted, because the failure mode is
invisible: the site works, the headers are simply gone.

## 8. nginx configuration

- `listen 8080`, root `/usr/share/nginx/html`.
- `try_files $uri $uri/index.html $uri/ =404;` — Astro builds directory-format
  output, so `/terms` is `terms/index.html`. `error_page 404 /404.html`.
- `location /_astro/` → `Cache-Control: public, max-age=31536000, immutable`.
  Filenames are content-hashed.
- HTML → `Cache-Control: public, max-age=0, must-revalidate`.
- `gzip on` for text types.
- `location = /healthz` returns a 200 with `access_log off`, matching the API's
  probe convention so the compose healthcheck has something cheap to hit.

## 9. `Dockerfile`

Four stages, one published, repository root as context.

```
base       node:24-alpine, corepack enable, WORKDIR /app
 └ pruner  COPY . . → turbo prune landing --docker
    └ deps      out/json + lockfile → pnpm install --frozen-lockfile
       └ builder  + out/full → turbo run build --filter=landing
          └ landing  nginx-unprivileged:alpine
                     + apps/landing/dist/ (from builder) → /usr/share/nginx/html
                     + apps/landing/nginx/ (from context) → /etc/nginx/conf.d,
                                                            /etc/nginx/snippets
```

The nginx configuration is copied from the build context rather than from
`builder`: it is checked-in configuration, not build output, and copying it
last keeps an edit to it from invalidating the install and build layers.

There is no `prod-deps` stage: the output is static files, so nothing from
`node_modules` reaches the runtime image.

The turbo version in the pruner is pinned, duplicating the root
`package.json`'s pin, exactly as the existing Dockerfile does — and carrying
the same comment that the two must move together.

`.dockerignore` gains `.astro`.

## 10. compose

A `landing` service on `ghcr.io/chornonoh-vova/barklog-landing:${IMAGE_TAG:-main}`
with `pull_policy: always` for the reason the file already documents at
length. No environment, no `depends_on` — it is static and independent of
migrate and valkey — exposing 8080 on `default` and `dokploy-network`, with a
`wget` healthcheck against `/healthz`.

`barklog.gg` is attached to this service in Dokploy's Domains tab, which
injects the Traefik labels and provisions the certificate. No `ports:`, as
everywhere else in that file.

## 11. CI

`images.yml` gains a fourth publish step, **last** in the sequence. Nothing
depends on the landing image, so a failure partway leaves the site at the
previous commit, which is harmless — the opposite of the migrate-first
ordering the file already reasons about.

It uses `file: apps/landing/Dockerfile`, the shared `barklog` cache scope,
`linux/amd64`, and `provenance: false`, like the others.

The `verify` job already runs `build`, `lint`, `check-types` and `test` across
the workspace, so the new scripts are picked up with no workflow change.
`packages/eslint-config` gains an `astro.js` flat config built on
`eslint-plugin-astro`, exported alongside `base`, `expo` and `node`.

**Pinned to `eslint-plugin-astro@^1.7.0`.** Every release from `2.0.0` onward
peers on `eslint >= 10.0.0`, and this workspace is on `eslint ^9.39.5` — which
upstream now publishes under the `maintenance` tag rather than `latest`.
`1.7.0` peers on `>= 8.57.0` and is the newest release compatible with the
workspace as it stands. Moving the repository to eslint 10 would unlock `^3`
and is worth doing, but it is an workspace-wide upgrade touching four configs
and every app, so it is a follow-up rather than a rider on this design.

## 12. Consequences and follow-ups

- `PROBLEM_BASE` in `apps/api/src/problems.ts` points at
  `https://barklog.gg/problems`, which nginx will answer 404. RFC 9457 does
  not require problem type URIs to resolve, so this is not a defect — but once
  the domain is live those 404s become visible in a way they are not today.
  A `/problems/*` route is a follow-up, not part of this design.
- The four screenshots ship as placeholders and must be replaced before the
  domain is pointed at the service.
- `APP_STORE_URL` in `src/config.ts` is a marked TODO until the listing
  exists. It is referenced from the hero and the footer, so swapping it is a
  one-line change.
- The workspace gains its first non-Node runtime image and its first native
  build dependencies (`@tailwindcss/oxide`, `sharp`).
