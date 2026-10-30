# Shared-link source preview — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Keep source context beside candidates and derive link labels from the actual destination. Thumbnail behavior must include legacy wire compatibility and missing metadata rather than the original two-provider assumption.

## Current references

- [Current implementation reference](../specs/2026-09-08-share-any-link-design.md)
- [ADR: staged share identification](../../adr/0007-staged-share-identification.md)
- [Implementation](../../../apps/mobile/src/features/share/share-header.tsx)
- [Tests or verification](../../../apps/mobile/src/features/share/share-header.test.tsx)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
