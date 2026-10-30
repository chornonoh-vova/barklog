---
status: accepted
---

# Identify shared links through staged processing

Shared links may point to HTTPS articles or videos, not just two video providers. Metadata retrieval uses vendored provider matching and oEmbed, then guarded page fetching and Open Graph parsing; outbound address and redirect checks live in the shared fetch implementation rather than relying on a fixed source-host allowlist.

Extraction first uses source metadata, withholding the URL; web search is an escalation only when that pass identifies no titles. This limits cost and preserves the meaning of basis. A mirrored IGDB game slug bypasses retrieval and extraction entirely. Guesses search the mirror, and candidates retain guess order while removing duplicate games.

Metadata is cached by requested share identity, while extraction uses the resolved identity plus model and prompt version so short and canonical links share extraction work. Fetch and extraction failures escape their cache loaders: a transient failure must not become a long-lived cached answer. Extraction failure falls back to the raw title with an `unavailable` basis; a successful extraction with no titles remains `none`.

The response's provider value retains legacy thumbnail-sizing tokens for older app builds; it is not the real source name. Source metadata retains the real provider, and the device derives the visible source-link label from its destination hostname.

## Current freshness limit

Extraction keys include the resolved share identity, model and prompt version, but not the source title or author. Metadata changes at the same URL can therefore leave an older extraction cached until expiry or a key-version change. The source comment claiming metadata is encoded in the key overstates the implementation; no new invalidation decision is made here.

## Historical difference

The original any-link draft proposed exposing arbitrary provider names. The maintained reference now describes the implemented compatibility restriction; the old execution plan is retired. This record does not adopt the abandoned widening of the wire field.

## Evidence

- [Any-link design and trade-offs](../superpowers/specs/2026-09-08-share-any-link-design.md)
- [Identification orchestration](../../apps/api/src/routes/games.ts), [metadata retrieval](../../apps/api/src/share/meta.ts), [extraction](../../apps/api/src/share/extract.ts), [wire compatibility](../../packages/contracts/src/share.ts)
- [Identification tests](../../apps/api/test/identify-routes.test.ts), [metadata tests](../../apps/api/test/share-meta.test.ts)
