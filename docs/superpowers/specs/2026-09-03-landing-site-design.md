# Landing site

Current implementation reference, checked on 2026-10-29. The original scaffold, placeholder asset and unassigned App Store link tasks are retired.

## Structure and behavior

[apps/landing](../../../apps/landing) builds a static Astro site using Tailwind's Vite plugin. Routes include home, support, terms, privacy and a custom 404 page. [config.ts](../../../apps/landing/src/config.ts) holds the assigned App Store link, contact address and repository URL. Assets and screenshots are checked in, and Geist is supplied by a local package dependency; the original font and screenshot placeholders are not outstanding tasks.

The site has no application backend, account storage, email-capture form or analytics integration. [reveal.ts](../../../apps/landing/src/scripts/reveal.ts) owns decorative motion; [global.css](../../../apps/landing/src/styles/global.css) owns styles. Preserve reduced-motion behavior and visible content when JavaScript or observation is unavailable. The legal layouts remain separate from marketing presentation.

Product claims must agree with [CONTEXT.md](../../../CONTEXT.md) and the ADRs, especially [server-owned entitlement](../../adr/0005-server-derived-entitlement.md) and [account deletion without subscription cancellation](../../adr/0006-clerk-account-deletion.md). Store pricing and offers require independent verification when changing marketing copy; a static page is not evidence of live store configuration.

## Serving constraints

[astro.config.mjs](../../../apps/landing/astro.config.mjs) disables inline stylesheets so the content security policy can omit `unsafe-inline`. The nginx [header snippet](../../../apps/landing/nginx/snippets/security-headers.conf) is included in every location: adding a location-level header otherwise loses inherited security headers. The current policy permits same-origin manifest loading, matching the linked web manifest.

[default.conf](../../../apps/landing/nginx/default.conf) serves content-hashed assets with immutable caching, revalidates pages, returns the custom 404, and has an unlogged `/healthz`. Its minimal access log records address, timestamp and requested URI rather than the default referrer and user-agent fields. Keep privacy copy aligned with actual logging and requests.

The [Dockerfile](../../../apps/landing/Dockerfile) uses the stock nginx image with custom configuration and `USER nginx`, not the originally proposed nginx-unprivileged image. A separate build avoids mixing the static runtime with the Node targets. Landing publishes independently with its own cache scope and has no migration dependency in compose; see the [deployment reference](2026-09-01-container-images-and-deploy-design.md).

## Verification and limits

[Landing tests](../../../apps/landing/test) cover built output, home and legal content, motion, reveal behavior and nginx configuration. Run the workspace's current scripts rather than historical dependency-install steps. There is no `/problems/*` page implementation; those problem-type links remain a separate documentation opportunity, not an implemented route. Live domain configuration and the contents of external store dashboards are outside this reference's verification.
