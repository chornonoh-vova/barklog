# Landing makeover — retired implementation plan

Historical record, retired on 2026-11-24 when the plan was executed on `feat/landing-makeover`. The task checklist, interfaces and test steps are not current instructions and have been removed; Git history retains the original plan. The maintained references are the [makeover design](../specs/2026-11-24-landing-makeover-design.md) and the [landing site reference](../specs/2026-09-03-landing-site-design.md).

## Rationale retained

- Copy lives in `@repo/i18n` under a `landing` subpath export, so the mobile bundle (which imports the package root) never carries web-only strings.
- One `Home.astro` renders every language; English stays at `/` with no language redirect, so crawlers reach each language at a stable URL.
- The FAQ's visible list and its `FAQPage` JSON-LD both come from `faqEntries()`, so they cannot drift.
- `sitemap.xml` and `llms.txt` are generated from the same copy and locale list as the pages.
- The hero's cover bob is finite and only declared under `prefers-reduced-motion: no-preference`; the ring is capped by `svh` so short phones shrink it before the headline and badge leave the first screen.
