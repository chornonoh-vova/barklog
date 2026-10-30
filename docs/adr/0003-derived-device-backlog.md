---
status: accepted
---

# Derive device views from one backlog query

The device uses one unfiltered backlog list query to derive Home's filtered views, counts and widget snapshots. Independent device counts and a separate widget backlog would create competing representations that must be kept in sync after every backlog entry write.

Only the successful backlog query is persisted, under a per-account key with an age limit and build/update buster. Restoration supplies stale starting data and triggers revalidation without replacing a newer fetch. The widget receives a derived snapshot with localized strings and local cover references; it does not fetch or own an independent backlog. Recents live in their own device store rather than being disguised as server query data.

This is a read cache, not an offline write model. The server remains authoritative, and [account-switch isolation](0004-account-switch-isolation.md) applies to personal copies and pending work.

## Current completeness limit

The server list query returns at most `BACKLOG_SOFT_CAP` entries (currently 5,000), without pagination or a corresponding total-entry write cap. The single-query decision remains in place, but a larger backlog produces a truncated device view and derived counts. The October 23 plan accepted derivation from the capped response; this record does not promise a complete view beyond that cap or introduce a new pagination decision.

## Evidence

- [Widget and persistence design](../superpowers/specs/2026-10-21-home-screen-widgets-design.md), [single-query plan](../superpowers/plans/2026-10-23-home-single-backlog-query.md)
- [Query hooks](../../apps/mobile/src/lib/api/hooks.ts), [persistence policy](../../apps/mobile/src/lib/query/query-persist-policy.ts), [widget observer](../../apps/mobile/src/features/widgets/widget-sync.tsx)
- [Persistence tests](../../apps/mobile/src/lib/query/query-persist.test.ts), [widget snapshot tests](../../apps/mobile/src/features/widgets/snapshot.test.ts)
