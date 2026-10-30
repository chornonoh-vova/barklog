---
status: accepted
---

# Serve games from a local mirror

Game requests read the Postgres mirror rather than calling IGDB. A separate worker owns sync runs, keeping IGDB credentials, throttling and ingestion off the request path and allowing searches to use local ranking and indexes.

Page writes are transactional and replay-safe; a failed run leaves the successful watermark unchanged so its range can be fetched again. Incremental reads overlap the watermark to account for IGDB's second-resolution timestamps. A session-scoped advisory lock prevents concurrent runs; a successful run records its watermark before requesting a search-cache version bump. Cache availability is best-effort, so successful ingestion does not require Valkey to acknowledge that bump.

## Unresolved cleanup guarantee

The current implementation acquires the lock and creates the run before entering its cleanup `try/finally`. A lock-query or run-creation failure can skip connection release; an unlock failure can also skip release. Resource ownership and regression coverage for those paths remain unresolved; this record preserves the sync policy, not those failure paths as intended behavior.

## Evidence

- [Original mirror plan](../superpowers/plans/2026-08-25-barklog-mirror-foundation.md)
- [Game request and cache design](../superpowers/specs/2026-08-25-barklog-api-design.md)
- [Sync orchestration](../../apps/worker/src/sync.ts), [page persistence](../../apps/worker/src/persist.ts), [watermark queries](../../packages/db/src/queries/sync-runs.ts)
- [Sync tests](../../apps/worker/test/sync.test.ts), [replay tests](../../apps/worker/test/persist.test.ts)
