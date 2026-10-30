# Share Source Preview — Superseded

**Status:** Historical design, consolidated into [Share Any Link](2026-09-08-share-any-link-design.md), under [ADR-0007](../../adr/0007-staged-share-identification.md).

The preview was introduced to keep the shared source recognizable while the user chooses a game. Its durable rationale remains: reserve thumbnail geometry before loading, treat missing or expired signed images as ordinary placeholder cases, hide decorative imagery from VoiceOver, and scroll the source context and extraction-failure warning with the results. Empty results still retain that context.

Provider-specific dimensions, `videoId`, the old oEmbed cache generation and the claim that mobile has no component-test harness are obsolete. The current reference documents dimension-based sizing, the hostname-labelled source link, compatibility fields, the Close toolbar and Jest coverage. This file is not an implementation checklist.
