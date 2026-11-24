# Landing site

Current implementation reference, checked on 2026-10-29 and updated on 2026-11-24 for the [landing makeover](2026-11-24-landing-makeover-design.md). The original scaffold, placeholder asset and unassigned App Store link tasks are retired.

## Structure and behavior

[apps/landing](../../../apps/landing) builds a static Astro site using Tailwind's Vite plugin. The home page is built once per app language from [Home.astro](../../../apps/landing/src/components/Home.astro): English at `/`, the others at `/de/`, `/es/`, `/uk/` and `/ru/` (the list is `LANGUAGES` from `@repo/i18n`). Support, terms, privacy and the custom 404 page are English-only and keep their URLs, which the App Store metadata links to. There is no language redirect; the footer links every language and the home pages name each other with `hreflang`.

All home-page copy lives in `@repo/i18n` as the `landing` export (`packages/i18n/src/locales/<lang>/landing.json`), kept out of the app's i18next `resources`; status names and glosses come from the app's own `app.json` keys. [i18n.ts](../../../apps/landing/src/i18n.ts) holds the locale helpers. Each page's head carries Open Graph and Twitter tags (one text-free `/og.jpg`), the Smart App Banner meta, and on home pages JSON-LD from [structured-data.ts](../../../apps/landing/src/structured-data.ts) (`MobileApplication`, `FAQPage` built from the visible FAQ, `WebSite`). `public/robots.txt` names AI crawlers as allowed; `sitemap.xml` and `llms.txt` are static endpoints generated from the same copy. The App Store badge is Apple's localized artwork per language (`app-store-badge-<lang>.svg`, from Apple's marketing tools, fills converted to attributes for the CSP), falling back to the English file for any language without one. [config.ts](../../../apps/landing/src/config.ts) holds the App Store id and link, contact address and repository URL. Assets and screenshots are checked in, and Geist is supplied by a local package dependency; the original font and screenshot placeholders are not outstanding tasks.

The site has no application backend, account storage, email-capture form or analytics integration. [reveal.ts](../../../apps/landing/src/scripts/reveal.ts) owns section reveals and the hero's cover bob is CSS declared only under `prefers-reduced-motion: no-preference`; [global.css](../../../apps/landing/src/styles/global.css) owns styles. Preserve reduced-motion behavior and visible content when JavaScript or observation is unavailable. The legal layouts remain separate from marketing presentation.

Product claims must agree with [CONTEXT.md](../../../CONTEXT.md) and the ADRs, especially [server-owned entitlement](../../adr/0005-server-derived-entitlement.md) and [account deletion without subscription cancellation](../../adr/0006-clerk-account-deletion.md). Store pricing and offers require independent verification when changing marketing copy; a static page is not evidence of live store configuration.

## Serving constraints

[astro.config.mjs](../../../apps/landing/astro.config.mjs) disables inline stylesheets so the content security policy can omit `unsafe-inline`. The only inline `<script>` allowed is the non-executed `application/ld+json` data block; `test/output.test.ts` enforces both. The nginx [header snippet](../../../apps/landing/nginx/snippets/security-headers.conf) is included in every location: adding a location-level header otherwise loses inherited security headers. The current policy permits same-origin manifest loading, matching the linked web manifest.

[default.conf](../../../apps/landing/nginx/default.conf) serves content-hashed assets with immutable caching, revalidates pages, returns the custom 404, and has an unlogged `/healthz`. Its minimal access log records address, timestamp and requested URI rather than the default referrer and user-agent fields. Keep privacy copy aligned with actual logging and requests.

The [Dockerfile](../../../apps/landing/Dockerfile) uses the stock nginx image with custom configuration and `USER nginx`, not the originally proposed nginx-unprivileged image. A separate build avoids mixing the static runtime with the Node targets. Landing publishes independently with its own cache scope and has no migration dependency in compose; see the [deployment reference](2026-09-01-container-images-and-deploy-design.md).

## Verification and limits

[Landing tests](../../../apps/landing/test) cover built output, home and legal content, motion, reveal behavior and nginx configuration. Run the workspace's current scripts rather than historical dependency-install steps. There is no `/problems/*` page implementation; those problem-type links remain a separate documentation opportunity, not an implemented route. Live domain configuration and the contents of external store dashboards are outside this reference's verification.
