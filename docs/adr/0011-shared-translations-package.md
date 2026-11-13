---
status: accepted
---

# Keep user-facing translations in one shared package

Agreed on 2026-11-13; not yet implemented.

User-facing copy for the app and the backend lives in `@repo/i18n` as i18next resources for every supported language. Release-alert notifications are the first copy the server renders, since Expo push cannot carry iOS localization keys. A separate server catalogue would duplicate languages, plural rules and date wording that the app already maintains, and the two would drift: a notification saying "Q3 2027" while the app says something else.

The app's existing strings move into the package's `app` namespace; server copy goes in its own namespaces, starting with `notifications`. Release-date wording is formatted by one function shared by both sides. A parity test keeps every language's key set identical.

Strings consumed by Expo's build-time config (Info.plist and widget `Localizable.strings` in `apps/mobile/locales`) stay with the app, because the config plugin reads those files directly. The landing site is English-only and outside this decision.

## Evidence

- [Release alerts design: shared foundations](../superpowers/specs/2026-11-13-release-alerts-and-countdowns-design.md)
- [Current app i18n](../../apps/mobile/src/lib/i18n/instance.ts)
