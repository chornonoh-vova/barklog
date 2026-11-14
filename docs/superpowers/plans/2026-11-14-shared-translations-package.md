# Shared translations package — retired implementation plan

Historical record, retired on completion of [#69](https://github.com/chornonoh-vova/barklog/issues/69) on 2026-11-14. The original task checklist, commands and expected output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device verification.

## Rationale retained

- The app's copy moved, not copied, into `@repo/i18n` as the `app` namespace, laid out the usual i18next way: `src/locales/<lng>/<namespace>.json`. `app` is the default namespace, so no `t("…")` call changed.
- The package has no runtime dependencies. It exports resources, the language list, `isLanguage` and a pure `formatLocale(language)`; the app and later the worker each own their i18next instance. JSON is imported with `with { type: "json" }`, which Node 24 requires and Metro and Jest accept.
- Copy checks are ordinary package tests rather than a separate script. `@lingual/i18n-check` 0.9.5 was evaluated and rejected: it compares targets against English only (missing extra keys and keys English lacks), does not check plural forms, and fails correct `uk`/`ru` `_one` forms that contain `{{count}}`.
- Library packages gained `dev: tsc --watch --preserveWatchOutput`, so turbo-driven `pnpm dev` rebuilds them while apps run. `pnpm --filter <app> dev` bypasses turbo and does not.

## Current references

- [ADR: shared translations package](../../adr/0011-shared-translations-package.md)
- [Release alerts design: shared translations](../specs/2026-11-13-release-alerts-and-countdowns-design.md)
- [Implementation](../../../packages/i18n/src/index.ts)
- [Tests or verification](../../../packages/i18n/test/copy.test.ts)
- [App i18n instance](../../../apps/mobile/src/lib/i18n/instance.ts)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
