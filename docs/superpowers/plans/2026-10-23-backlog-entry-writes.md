# Backlog entry writes — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

The original optimistic-update and rollback proposal was superseded: device writes now wait for the server and refetch. A move omits rating to preserve it, explicit null clears it, and unknown cached entitlement allows the server to decide.

## Current references

- [Current implementation reference](../specs/2026-08-27-barklog-mobile-design.md)
- [ADR: server authoritative backlog writes](../../adr/0002-server-authoritative-backlog-writes.md)
- [Implementation](../../../apps/mobile/src/features/backlog/entry-writes.ts)
- [Tests or verification](../../../apps/mobile/src/features/backlog/entry-writes.test.ts)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
