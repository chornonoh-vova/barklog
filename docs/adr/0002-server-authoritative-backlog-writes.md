---
status: accepted
---

# Keep backlog entry writes server-authoritative

The server owns the free-tier cap; a device slot check is an advisory check at tap time using cached entitlement and backlog data. Unknown data lets a write through, while the server can reject it with 402. Enforcement belongs with the backlog entry write, not solely on the device where it could be bypassed.

For a slot-consuming write, the server locks the user inside a transaction before reading the existing entry, entitlement and slot count. The lock relies on READ COMMITTED visibility so competing writes cannot both claim the same remaining slot. A move omits the rating and preserves it; explicit `null` clears it.

The device does not apply an optimistic cache change: it invalidates the game and backlog queries when the write settles and displays the refetched result. This avoids maintaining snapshots and rollback rules for speculative changes. A server 402 opens the paywall and invalidates entitlement data rather than also displaying an error alert.

## Historical difference

The original October 23 plan proposed optimistic changes and rollback. That proposal was superseded by server confirmation and refetching, and the plan is now a retired navigation record. Its rating and advisory slot-check rationale remains applicable.

## Evidence

- [Premium design](../superpowers/specs/2026-09-01-premium-subscription-design.md), [historical entry-write plan](../superpowers/plans/2026-10-23-backlog-entry-writes.md)
- [Server write](../../apps/api/src/backlog/entry-write.ts), [device write](../../apps/mobile/src/features/backlog/entry-writes.ts)
- [Cap tests](../../apps/api/test/backlog-cap.test.ts), [device write tests](../../apps/mobile/src/features/backlog/entry-writes.test.ts)
