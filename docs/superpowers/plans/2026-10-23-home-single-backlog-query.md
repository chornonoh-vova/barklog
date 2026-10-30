# One device backlog query — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Home filtering and counts derive from one unfiltered backlog query. The original instruction to leave the separate device stats query unchanged is superseded by the entry-write consolidation; the server stats route still exists.

## Current references

- [Current implementation reference](../specs/2026-10-21-home-screen-widgets-design.md)
- [ADR: derived device backlog](../../adr/0003-derived-device-backlog.md)
- [Implementation](../../../apps/mobile/src/lib/api/hooks.ts)
- [Tests or verification](../../../apps/mobile/src/features/backlog/backlog-screen.test.tsx)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
