# Recents and adaptive polish — retired implementation plan

Historical record, retired during the documentation audit on 2026-10-29. The original task checklist, copied implementation and expected test output are not current instructions and have been removed. Git history retains the original plan; this note preserves its relevant rationale and points to maintained references. Retirement does not certify device or deployment verification.

## Rationale retained

Recents are personal device data with their own store. Their clear/read race protection must survive refactoring. Device verification remains necessary, but this record does not assert that a particular simulator is installed or that a manual pass was completed.

## Current references

- [Current implementation reference](../specs/2026-10-12-ipad-duo-adaptive-layout-design.md)
- [ADR: account switch isolation](../../adr/0004-account-switch-isolation.md)
- [Implementation](../../../apps/mobile/src/features/search/recents-storage.ts)
- [Tests or verification](../../../docs/mobile-device-verification.md)

Use the current workspace manifests and [agent guide](../../../AGENTS.md) for commands and conventions. Start any new change from the current code and ADRs rather than replaying this plan.
